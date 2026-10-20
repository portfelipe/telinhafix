'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../games/secret-hitler/engine');
const { view } = require('../games/secret-hitler/views');

function setup(n = 5, acknowledge = true) {
  const g = E.createGame();
  for (let i = 0; i < n; i++) { E.addPlayer(g, `p${i}`, `Pessoa ${i}`); E.action(g, `p${i}`, 'ready', { ready: true }); }
  E.action(g, 'p0', 'start');
  if (acknowledge) for (const p of g.players) E.action(g, p.id, 'ack-role');
  return g;
}
function vote(g, yes = true, candidate = E.eligible(g).find(id => E.player(g, id).role !== 'hitler')) {
  E.action(g, g.president, 'nominate', { target: candidate || E.eligible(g)[0] });
  for (const p of E.alive(g)) E.action(g, p.id, 'vote', { yes });
}
function legislation(g) {
  E.action(g, g.president, 'discard', { index: 0 });
  E.action(g, g.chancellor, 'enact', { index: 0 });
}
function powerState(n, power) {
  const g = setup(n);
  g.phase = 'executive'; g.power = power; g.president = 'p0';
  return g;
}
for (let n = 5; n <= 10; n++) test(`${n} players: correct roles and 17 policies`, () => {
  const g = setup(n);
  const counts = role => g.players.filter(p => p.role === role).length;
  assert.equal(counts('hitler'), 1);
  assert.equal(counts('liberal'), E.ROLES[n][0]);
  assert.equal(counts('fascist'), E.ROLES[n][1]);
  assert.equal(g.deck.filter(c => c === 'liberal').length, 6);
  assert.equal(g.deck.filter(c => c === 'fascist').length, 11);
});
test('lobby enforces readiness, capacity and host', () => {
  const g = E.createGame();
  for (let i = 0; i < 10; i++) E.addPlayer(g, `p${i}`, `${i}`);
  assert.throws(() => E.addPlayer(g, 'extra', 'Extra'));
  assert.throws(() => E.action(g, 'p0', 'start'));
  assert.throws(() => E.action(g, 'p1', 'start'));
});
test('roles need acknowledgement; private knowledge differs at 6 and 7', () => {
  for (const n of [6, 7]) {
    const g = setup(n, false);
    assert.equal(g.phase, 'roles');
    assert.throws(() => E.action(g, g.president, 'nominate', { target: 'p0' }));
    const h = g.players.find(p => p.role === 'hitler');
    const f = g.players.find(p => p.role === 'fascist');
    const l = g.players.find(p => p.role === 'liberal');
    assert.equal(view(g, h.id).secret.allies.length, n === 6 ? 1 : 0);
    assert.ok(view(g, f.id).secret.allies.some(p => p.role === 'hitler'));
    assert.deepEqual(view(g, l.id).secret.allies, []);
    assert.equal(view(g, null).secret, null);
    assert.ok(view(g, f.id).players.every(p => !Object.hasOwn(p, 'role')));
  }
});
test('votes remain secret until all living players vote; ties reject', () => {
  const g = setup(6); E.action(g, g.president, 'nominate', { target: E.eligible(g)[0] });
  E.action(g, 'p0', 'vote', { yes: true });
  const other = view(g, 'p1');
  assert.equal(other.yourVote, null); assert.equal(other.lastVote, null);
  assert.equal(other.voteCount, 1); assert.equal(other.votes, undefined);
  assert.throws(() => E.action(g, 'p0', 'vote', { yes: false }));
  for (let i = 1; i < 6; i++) E.action(g, `p${i}`, 'vote', { yes: i < 3 });
  assert.equal(g.lastVote.approved, false); assert.equal(g.tracker, 1);
});
test('term limits use last elected government and exception at five living players', () => {
  const g = setup(7); g.president = 'p0'; g.previousPresident = 'p1'; g.previousChancellor = 'p2';
  assert.ok(!E.eligible(g).includes('p1')); assert.ok(!E.eligible(g).includes('p2'));
  g.players[5].alive = false; g.players[6].alive = false;
  assert.ok(E.eligible(g).includes('p1')); assert.ok(!E.eligible(g).includes('p2'));
  vote(g, false);
  assert.equal(g.previousPresident, 'p1'); assert.equal(g.previousChancellor, 'p2');
});
test('legislative hands go only to the correct office holder', () => {
  const g = setup(); vote(g);
  assert.equal(view(g, g.president).secret.hand.length, 3);
  assert.equal(view(g, g.chancellor).secret.hand.length, 0);
  assert.equal(view(g, null).secret, null);
  assert.throws(() => E.action(g, g.chancellor, 'discard', { index: 0 }));
  E.action(g, g.president, 'discard', { index: 1 });
  assert.equal(view(g, g.president).secret.hand.length, 0);
  assert.equal(view(g, g.chancellor).secret.hand.length, 2);
  E.action(g, g.chancellor, 'enact', { index: 0 });
  assert.equal(g.liberals + g.fascists, 1);
  assert.equal(g.deck.length + g.discard.length + g.liberals + g.fascists, 17);
});
test('third failed election enacts chaos without power and clears term limits', () => {
  const g = setup(9); g.deck[0] = 'fascist'; g.previousPresident = 'p1'; g.previousChancellor = 'p2';
  vote(g, false); vote(g, false); vote(g, false);
  assert.equal(g.fascists, 1); assert.equal(g.power, null);
  assert.equal(g.phase, 'nomination'); assert.equal(g.tracker, 0);
  assert.equal(g.previousPresident, null); assert.equal(g.previousChancellor, null);
});
test('Hitler election wins only at or after three fascist policies', () => {
  for (const fascists of [2, 3]) {
    const g = setup(); const h = g.players.find(p => p.role === 'hitler');
    g.president = g.players.find(p => p.id !== h.id).id; g.fascists = fascists;
    vote(g, true, h.id);
    assert.equal(g.status, fascists === 3 ? 'over' : 'playing');
    if (fascists === 3) assert.equal(g.winner, 'fascist');
  }
});
test('policy victory for both parties', () => {
  for (const policy of ['liberal', 'fascist']) {
    const g = setup(); vote(g);
    g.liberals = policy === 'liberal' ? 4 : 0;
    g.fascists = policy === 'fascist' ? 5 : 0;
    g.hand = [policy, policy, policy]; legislation(g);
    assert.equal(g.status, 'over'); assert.equal(g.winner, policy);
  }
});
test('board powers are correct for all player counts', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    for (let count = 1; count <= 5; count++) {
      const g = setup(n); vote(g);
      g.fascists = count - 1; g.hand = ['fascist', 'fascist', 'fascist']; legislation(g);
      const expected = E.POWERS[n <= 6 ? 'small' : n <= 8 ? 'medium' : 'large'][count - 1];
      assert.equal(g.power, expected, `${n}/${count}`);
    }
  }
});
test('investigation reveals party only, privately, and cannot repeat', () => {
  const g = powerState(9, 'investigate');
  const target = g.players.find(p => p.role === 'hitler');
  g.president = g.players.find(p => p.id !== target.id).id;
  const president = g.president;
  E.action(g, president, 'power', { target: target.id });
  assert.ok(view(g, president).secret.notes[0].includes('Fascista'));
  assert.ok(!view(g, president).secret.notes[0].includes('Hitler'));
  assert.deepEqual(view(g, target.id).secret.notes, []);
  g.phase = 'executive'; g.power = 'investigate'; g.president = president;
  assert.throws(() => E.action(g, president, 'power', { target: target.id }));
});
test('peek leaves deck order unchanged and result private', () => {
  const g = powerState(5, 'peek'), deck = [...g.deck];
  E.action(g, 'p0', 'power');
  assert.deepEqual(g.deck, deck);
  assert.equal(view(g, 'p0').secret.notes.length, 1);
  assert.equal(view(g, 'p1').secret.notes.length, 0);
});
test('special election returns to original rotation even on rejection', () => {
  for (const target of ['p1', 'p5']) {
    const g = powerState(7, 'special');
    E.action(g, 'p0', 'power', { target }); assert.equal(g.president, target);
    vote(g, false); assert.equal(g.president, 'p1');
  }
});
test('execution removes participation, hides ordinary role and ends game for Hitler', () => {
  const g = powerState(7, 'execute');
  const ordinary = g.players.find(p => p.id !== 'p0' && p.role !== 'hitler');
  E.action(g, 'p0', 'power', { target: ordinary.id });
  assert.equal(ordinary.alive, false);
  assert.equal(view(g, null).players.find(p => p.id === ordinary.id).role, undefined);
  assert.throws(() => E.action(g, ordinary.id, 'vote', { yes: true }));
  const h = g.players.find(p => p.role === 'hitler');
  g.phase = 'executive'; g.power = 'execute'; g.president = g.players.find(p => p.alive && p.id !== h.id).id;
  E.action(g, g.president, 'power', { target: h.id });
  assert.equal(g.winner, 'liberal');
});
test('veto rejected cannot repeat; accepted veto advances tracker without clearing term limits', () => {
  const g = setup(); vote(g); g.fascists = 5;
  E.action(g, g.president, 'discard', { index: 0 });
  E.action(g, g.chancellor, 'request-veto');
  E.action(g, g.president, 'respond-veto', { accept: false });
  assert.throws(() => E.action(g, g.chancellor, 'request-veto'));
  g.vetoDenied = false;
  E.action(g, g.chancellor, 'request-veto');
  const president = g.president, chancellor = g.chancellor;
  E.action(g, president, 'respond-veto', { accept: true });
  assert.equal(g.tracker, 1); assert.equal(g.previousPresident, president);
  assert.equal(g.previousChancellor, chancellor); assert.equal(g.hand.length, 0);
});
test('accepted election does not reset tracker; veto can trigger chaos', () => {
  const g = setup(); g.tracker = 2; vote(g); assert.equal(g.tracker, 2);
  g.fascists = 5; E.action(g, g.president, 'discard', { index: 0 });
  g.deck[0] = 'liberal';
  E.action(g, g.chancellor, 'request-veto');
  E.action(g, g.president, 'respond-veto', { accept: true });
  assert.equal(g.tracker, 0); assert.equal(g.liberals, 1); assert.equal(g.previousChancellor, null);
});
test('disconnect pauses without changing role; dead disconnected players do not pause', () => {
  const g = setup(), role = g.players[0].role;
  E.connection(g, 'p0', false); assert.ok(E.paused(g));
  assert.throws(() => E.action(g, g.players.find(p => p.connected).id, 'vote', { yes: true }));
  E.connection(g, 'p0', true); assert.equal(g.players[0].role, role); assert.ok(!E.paused(g));
  g.players[0].alive = false; E.connection(g, 'p0', false); assert.ok(!E.paused(g));
});
test('reset uses a new game identity and clears all secret information', () => {
  const g = setup(), id = g.id;
  E.action(g, g.host, 'abort'); E.action(g, g.host, 'reset');
  assert.notEqual(g.id, id); assert.equal(g.status, 'lobby');
  assert.ok(g.players.every(p => p.role === null)); assert.deepEqual(g.privateNotes, {});
});
test('random legal complete games preserve card counts and end', () => {
  for (let n = 5; n <= 10; n++) for (let simulation = 0; simulation < 20; simulation++) {
    const g = setup(n);
    for (let step = 0; g.status !== 'over' && step < 500; step++) {
      if (g.phase === 'nomination') vote(g, step % 4 !== 0, E.eligible(g)[0]);
      else if (g.phase === 'president-discard') E.action(g, g.president, 'discard', { index: step % 3 });
      else if (g.phase === 'chancellor-enact') E.action(g, g.chancellor, 'enact', { index: step % 2 });
      else if (g.phase === 'executive') {
        const target = E.alive(g).find(p => p.id !== g.president && (g.power !== 'investigate' || !g.investigated.includes(p.id)));
        E.action(g, g.president, 'power', { target: target?.id });
      } else assert.fail(`Unexpected phase ${g.phase}`);
      if (g.status !== 'over') assert.equal(g.deck.length + g.discard.length + g.hand.length + g.liberals + g.fascists, 17);
    }
    assert.equal(g.status, 'over'); assert.ok(g.winner);
  }
});
