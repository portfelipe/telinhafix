'use strict';
const { player, paused, eligible, POWERS } = require('./engine');

// Never serialize the engine itself: this allow-list is also used for spectators.
function view(g, viewerId) {
  if (!g) return { status: 'idle', players: [], you: null };
  const me = player(g, viewerId);
  const secret = me && me.role ? {
    role: me.role,
    allies: me.role === 'fascist' || (me.role === 'hitler' && g.players.length <= 6)
      ? g.players.filter(p => p.id !== me.id && p.role !== 'liberal').map(p => ({ id: p.id, name: p.name, role: p.role }))
      : [],
    notes: [...(g.privateNotes[me.id] || [])],
    hand: (g.phase === 'president-discard' && me.id === g.president)
      || (['chancellor-enact', 'veto'].includes(g.phase) && me.id === g.chancellor) ? [...g.hand] : [],
  } : null;
  return {
    id: g.id, revision: g.revision, phaseId: g.phaseId, status: g.status, phase: g.phase,
    you: me?.id || null, host: g.host, paused: paused(g),
    players: g.players.map(p => ({
      id: p.id, name: p.name, connected: p.connected, alive: p.alive,
      ready: p.ready, acknowledged: p.acknowledged,
      ...(g.status === 'over' ? { role: p.role } : {}),
    })),
    president: g.president, chancellor: g.chancellor,
    previousPresident: g.previousPresident, previousChancellor: g.previousChancellor,
    eligible: g.phase === 'nomination' ? eligible(g) : [],
    liberals: g.liberals, fascists: g.fascists, tracker: g.tracker,
    deckCount: g.deck.length, discardCount: g.discard.length,
    voteCount: g.phase === 'voting' ? Object.keys(g.votes).length : 0,
    yourVote: me && g.phase === 'voting' && Object.hasOwn(g.votes, me.id) ? g.votes[me.id] : null,
    lastVote: g.lastVote ? { ...g.lastVote, votes: { ...g.lastVote.votes } } : null,
    power: g.power, investigated: [...g.investigated],
    powers: POWERS[g.players.length <= 6 ? 'small' : g.players.length <= 8 ? 'medium' : 'large'],
    vetoAvailable: g.fascists >= 5 && !g.vetoDenied && g.phase === 'chancellor-enact',
    round: g.round, log: g.log.slice(-80), winner: g.winner, reason: g.reason,
    secret,
  };
}
module.exports = { view };
