'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const E = require('../games/secret-hitler/engine');
const { view } = require('../games/secret-hitler/views');
const source = fs.readFileSync(path.join(__dirname, '../../client/renderer/games/secret-hitler.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('UI: first login to an empty room renders idle state without a previous revision', async t => {
  const dom = new JSDOM('<div id="game-overlay"><div id="secret-hitler-view"></div></div>', {
    url: 'http://localhost:3000/', runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.secretHitler = { getState: async () => ({ state: view(null, null) }), onState: () => {} };
  w.eval(source);
  await w.SecretHitlerUI.connect('empty-room', () => {});
  w.SecretHitlerUI.show();
  await tick();
  assert.ok(w.document.body.textContent.includes('Abrir lobby'));
  assert.equal(w.document.querySelector('.sh-error'), null);
});
function harness() {
  const g = E.createGame();
  for (let i = 0; i < 5; i++) E.addPlayer(g, `p${i}`, i ? `Jogador ${i}` : '<img src=x onerror=alert(1)>');
  const dom = new JSDOM('<div id="game-overlay"><div id="secret-hitler-view" class="hidden"></div></div>', {
    url: 'http://localhost:3000/', runScripts: 'outside-only',
  });
  const w = dom.window;
  w.crypto.randomUUID = randomUUID;
  w.confirm = () => true;
  let receive;
  w.secretHitler = {
    getState: async () => ({ state: view(g, 'p0') }),
    join: async () => ({ state: view(g, 'p0'), token: 'test-token' }),
    onState: cb => { receive = cb; },
    action: async ({ type, data }) => {
      E.action(g, 'p0', type, data);
      receive(view(g, 'p0'));
      return { state: view(g, 'p0') };
    },
  };
  w.eval(source);
  const body = () => w.document.getElementById('secret-hitler-view').textContent;
  async function click(label) {
    const b = [...w.document.querySelectorAll('button')].find(x => x.textContent === label);
    assert.ok(b, `Missing button: ${label}`);
    assert.equal(b.disabled, false, `Disabled button: ${label}`);
    b.click(); await tick();
  }
  return { g, dom, w, body, click, push: () => receive(view(g, 'p0')) };
}
test('UI: lobby through role confirmation, private envelope, safe names and navigation', async t => {
  const { g, dom, w, body, click, push } = harness(); t.after(() => dom.window.close());
  await w.SecretHitlerUI.connect('ui-test', () => {});
  w.SecretHitlerUI.show(); await tick();
  assert.ok(body().includes('Uma mesa. Duas lealdades.'));
  assert.equal(w.document.querySelectorAll('img').length, 0);
  await click('Estou pronto');
  assert.ok(g.players[0].ready);
  for (const p of g.players.slice(1)) E.action(g, p.id, 'ready', { ready: true });
  push();
  await click('Distribuir papéis');
  assert.equal(g.phase, 'roles');
  assert.ok(!body().includes('Você é '));
  await click('Ver meu papel e anotações');
  assert.ok(body().includes('Você é '));
  w.dispatchEvent(new w.Event('blur'));
  assert.ok(!body().includes('Você é '));
  await click('Ver meu papel e anotações');
  await click('Li meu papel');
  for (const p of g.players.slice(1)) E.action(g, p.id, 'ack-role');
  push(); assert.equal(g.phase, 'nomination');
  w.SecretHitlerUI.hide(); assert.equal(body(), '');
  w.SecretHitlerUI.show(); await tick();
  assert.ok(!body().includes('Você é '));
});
test('UI: secret cards, vote state, power actions, end screen and reconnect', async t => {
  const { g, dom, w, body, click, push } = harness(); t.after(() => dom.window.close());
  for (const p of g.players) E.action(g, p.id, 'ready', { ready: true });
  E.action(g, 'p0', 'start');
  for (const p of g.players) E.action(g, p.id, 'ack-role');
  let reconnected = false;
  await w.SecretHitlerUI.connect('ui-test-2', () => {}, () => { reconnected = true; });
  w.SecretHitlerUI.show(); await tick();
  g.president = 'p0'; push();
  await click('Jogador 1');
  await click('JA! · Aprovar');
  assert.ok(body().includes('Seu voto: Ja'));
  for (const p of g.players.slice(1)) E.action(g, p.id, 'vote', { yes: true });
  push();
  assert.equal(w.document.querySelectorAll('.sh-card').length, 0);
  await click('Revelar minhas cartas');
  assert.equal(w.document.querySelectorAll('.sh-card').length, 3);
  w.document.querySelector('.sh-card').click(); await tick();
  assert.equal(g.phase, 'chancellor-enact');
  assert.equal(w.document.querySelectorAll('.sh-card').length, 0);
  assert.ok(body().includes('Jogador 1 deve aprovar'));
  g.phase = 'executive'; g.phaseId++; g.power = 'peek'; push();
  await click('Consultar próximas políticas');
  await click('Ver meu papel e anotações');
  assert.ok(body().includes('próximas políticas'));
  w.SecretHitlerUI.disconnected();
  assert.ok(!body().includes('Você é '));
  await click('Reconectar à sala'); assert.ok(reconnected);
  await w.SecretHitlerUI.connect('ui-test-2', () => {}); push();
  await click('Encerrar partida');
  assert.equal(g.status, 'over');
  assert.ok(body().includes('sem vencedor'));
  await click('Novo lobby');
  assert.equal(g.status, 'lobby');
  assert.ok(!body().includes('próximas políticas'));
});
