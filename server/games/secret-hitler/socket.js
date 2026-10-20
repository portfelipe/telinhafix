'use strict';
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { createGame, addPlayer, connection, action, player } = require('./engine');
const { view } = require('./views');
const hash = token => createHash('sha256').update(token).digest('hex');

function createSecretHitlerService({ io, rooms, invite, retentionMs = 5 * 60 * 1000 }) {
  const games = new Map();
  function record(roomId) {
    if (!games.has(roomId)) games.set(roomId, { game: createGame(), tokens: new Map(), sockets: new Map(), requests: new Map(), timer: null });
    const r = games.get(roomId);
    clearTimeout(r.timer); r.timer = null;
    return r;
  }
  function identity(r, socketId) {
    if (!r) return null;
    for (const [id, sid] of r.sockets) if (sid === socketId) return id;
    return null;
  }
  function broadcast(roomId) {
    const r = games.get(roomId);
    if (!r) return;
    for (const sid of rooms.get(roomId)?.keys() || []) {
      io.to(sid).emit('sh-state', view(r.game, identity(r, sid)));
    }
  }
  function departed(roomId, socketId) {
    const r = games.get(roomId);
    if (!r) return;
    const id = identity(r, socketId);
    if (id) { r.sockets.delete(id); connection(r.game, id, false); }
    broadcast(roomId);
    // Room cleanup in the parent runs after this hook.
    if ((rooms.get(roomId)?.size || 0) <= 1) {
      clearTimeout(r.timer);
      r.timer = setTimeout(() => {
        if (games.get(roomId) === r && !rooms.get(roomId)?.size) games.delete(roomId);
      }, retentionMs);
      r.timer.unref?.();
    }
  }
  function register(socket, getRoom) {
    const wrap = handler => (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const roomId = getRoom();
        if (!roomId || !rooms.get(roomId)?.has(socket.id)) throw new Error('Entre em uma sala primeiro.');
        if (payload !== null && payload !== undefined && (typeof payload !== 'object' || Array.isArray(payload))) throw new Error('Pedido inválido.');
        ack({ ok: true, ...handler(roomId, payload || {}) });
      } catch (err) { ack({ ok: false, error: err.message }); }
    };
    socket.on('sh-get-state', wrap(roomId => {
      const r = games.get(roomId);
      return { state: view(r?.game, identity(r, socket.id)) };
    }));
    socket.on('sh-join', wrap((roomId, data) => {
      if (data.token !== undefined && (typeof data.token !== 'string' || data.token.length > 128)) throw new Error('Sessão inválida.');
      const existing = games.get(roomId);
      if (data.token && !existing) throw new Error('A sessão expirou. Entre novamente no lobby.');
      const r = record(roomId);
      let id = identity(r, socket.id);
      let token;
      if (!id && data.token) {
        id = r.tokens.get(hash(data.token));
        if (!id || !player(r.game, id)) throw new Error('A sessão expirou. Entre novamente no lobby.');
        const active = r.sockets.get(id);
        if (active && active !== socket.id && io.sockets.sockets.get(active)?.connected) throw new Error('Esse jogador já está conectado em outra janela.');
        connection(r.game, id, true);
      } else if (!id) {
        id = randomUUID(); token = randomBytes(32).toString('base64url');
        addPlayer(r.game, id, rooms.get(roomId).get(socket.id).name);
        r.tokens.set(hash(token), id);
      }
      r.sockets.set(id, socket.id);
      // Reissuing from the already authenticated socket also recovers a lost join acknowledgement.
      if (!data.token && !token) {
        token = randomBytes(32).toString('base64url');
        for (const [oldToken, pid] of r.tokens) if (pid === id) r.tokens.delete(oldToken);
        r.tokens.set(hash(token), id);
      }
      if (token && r.game.players.length === 1) invite(socket, roomId, 'secret-hitler');
      broadcast(roomId);
      return { state: view(r.game, id), ...(token ? { token } : {}) };
    }));
    socket.on('sh-action', wrap((roomId, data) => {
      const r = games.get(roomId);
      const id = identity(r, socket.id);
      if (!r || !id) throw new Error('Entre no lobby para jogar.');
      if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(data.requestId)) throw new Error('Pedido sem identificador válido.');
      const key = `${id}:${data.requestId}`;
      if (r.requests.has(key)) return { state: view(r.game, id) };
      if (data.gameId !== r.game.id || data.phaseId !== r.game.phaseId) throw new Error('A fase mudou. Confira a tela e tente novamente.');
      if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) throw new Error('Ação inválida.');
      action(r.game, id, data.type, data.data);
      r.requests.set(key, true);
      if (r.requests.size > 1000) r.requests.delete(r.requests.keys().next().value);
      if (data.type === 'leave') {
        r.sockets.delete(id);
        for (const [token, pid] of r.tokens) if (pid === id) r.tokens.delete(token);
      }
      if (data.type === 'reset' || data.type === 'remove-disconnected') {
        for (const [token, pid] of r.tokens) if (!player(r.game, pid)) r.tokens.delete(token);
      }
      broadcast(roomId);
      return { state: view(r.game, identity(r, socket.id)) };
    }));
  }
  function close() { for (const r of games.values()) clearTimeout(r.timer); games.clear(); }
  return { register, departed, broadcast, close };
}
module.exports = { createSecretHitlerService };
