'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');
const { randomUUID } = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (socket, event, data = null) => new Promise((resolve, reject) => {
  socket.timeout(3000).emit(event, data, (err, result) => err ? reject(err) : resolve(result));
});
test('real server: isolation, secrecy, idempotency, resumption and existing games', { timeout: 30000 }, async t => {
  const server = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', APP_PASSWORD: '', ADMIN_PASSWORD: '', METERED_TURN_URL: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const clients = [];
  t.after(() => { clients.forEach(s => s.disconnect()); server.kill(); });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/rodando na porta (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  async function client(name, room = 'test-sh') {
    const s = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(s);
    await new Promise((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); });
    assert.equal((await emit(s, 'join-room', { roomId: room, name })).ok, true);
    return s;
  }
  const seats = [];
  for (let i = 0; i < 6; i++) {
    const s = await client(i < 2 ? 'Mesmo nome' : `Jogador ${i}`);
    const joined = await emit(s, 'sh-join', {});
    assert.equal(joined.ok, true);
    seats.push({ s, token: joined.token, id: joined.state.you });
  }
  const observer = await client('Observador');
  const outsider = await client('Outra sala', 'other');
  const get = async s => (await emit(s, 'sh-get-state')).state;
  async function act(seat, type, data = {}, requestId = randomUUID()) {
    const state = await get(seat.s);
    return emit(seat.s, 'sh-action', { type, data, requestId, gameId: state.id, phaseId: state.phaseId });
  }
  assert.equal((await get(outsider)).status, 'idle');
  assert.equal((await get(observer)).you, null);
  assert.equal((await emit(observer, 'sh-action', { type: 'start' })).ok, false);
  assert.equal((await emit(seats[0].s, 'join-room', { roomId: 'other', name: 'X' })).ok, false);
  const duplicateId = randomUUID();
  assert.equal((await act(seats[0], 'ready', { ready: true }, duplicateId)).ok, true);
  assert.equal((await act(seats[0], 'ready', { ready: false }, duplicateId)).state.players[0].ready, true);
  for (const seat of seats.slice(1)) assert.equal((await act(seat, 'ready', { ready: true })).ok, true);
  assert.equal((await act(seats[1], 'start')).ok, false);
  assert.equal((await act(seats[0], 'start')).ok, true);
  const obs = await get(observer);
  assert.equal(obs.secret, null);
  assert.ok(obs.players.every(p => !Object.hasOwn(p, 'role')));
  assert.equal(obs.deck, undefined); assert.equal(obs.tokens, undefined);
  const original = await get(seats[2].s);
  const oldSocket = seats[2].s;
  oldSocket.disconnect();
  for (let i = 0; i < 50 && !(await get(observer)).paused; i++) await delay(20);
  assert.equal((await get(observer)).paused, true);
  const impostor = await client('Jogador 2');
  assert.equal((await emit(impostor, 'sh-join', {})).ok, false);
  assert.equal((await emit(impostor, 'sh-join', { token: 'wrong' })).ok, false);
  assert.equal((await get(impostor)).secret, null);
  const restoredSocket = await client('Novo nome');
  const restored = await emit(restoredSocket, 'sh-join', { token: seats[2].token });
  assert.equal(restored.ok, true);
  assert.equal(restored.state.you, original.you);
  assert.equal(restored.state.secret.role, original.secret.role);
  assert.equal(restored.state.paused, false);
  seats[2].s = restoredSocket;
  assert.equal((await emit(impostor, 'sh-join', { token: seats[2].token })).ok, false);
  for (const seat of seats) assert.equal((await act(seat, 'ack-role')).ok, true);
  let state = await get(observer);
  const president = seats.find(p => p.id === state.president);
  assert.equal((await act(president, 'nominate', { target: state.eligible[0] })).ok, true);
  const stale = { gameId: state.id, phaseId: state.phaseId, type: 'vote', data: { yes: true }, requestId: randomUUID() };
  assert.equal((await emit(president.s, 'sh-action', stale)).ok, false);
  assert.equal((await act(seats[0], 'vote', { yes: true })).ok, true);
  state = await get(observer);
  assert.equal(state.voteCount, 1); assert.equal(state.lastVote, null); assert.equal(state.yourVote, null);
  for (const seat of seats.slice(1)) await act(seat, 'vote', { yes: true });
  state = await get(observer);
  assert.equal(state.phase, 'president-discard');
  assert.equal(Object.keys(state.lastVote.votes).length, 6);
  for (const seat of seats) {
    assert.equal((await get(seat.s)).secret.hand.length, seat.id === president.id ? 3 : 0);
  }
  assert.equal((await act(president, 'discard', { index: -1 })).ok, false);
  assert.equal((await act(president, 'discard', { index: 0 })).ok, true);
  const chancellor = seats.find(p => p.id === state.chancellor);
  assert.equal((await get(president.s)).secret.hand.length, 0);
  assert.equal((await get(chancellor.s)).secret.hand.length, 2);
  assert.equal((await act(chancellor, 'enact', { index: 0 })).ok, true);
  state = await get(observer);
  assert.equal(state.liberals + state.fascists, 1);
  assert.equal((await emit(observer, 'game-get-state')).ok, true);
  assert.equal((await emit(observer, 'stop-get-state')).ok, true);
  assert.equal((await emit(observer, 'sketch-get-state')).ok, true);
  assert.equal((await emit(observer, 'game-get-secret-map')).ok, false);
  const host = seats.find(p => p.id === state.host);
  assert.equal((await act(host, 'abort')).ok, true);
  const finished = await get(observer);
  assert.ok(finished.players.every(p => typeof p.role === 'string'));
  assert.equal((await act(host, 'reset')).ok, true);
  const fresh = await get(observer);
  assert.notEqual(fresh.id, finished.id); assert.equal(fresh.secret, null);
  assert.ok(fresh.players.every(p => !Object.hasOwn(p, 'role')));
});
