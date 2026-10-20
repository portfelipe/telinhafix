'use strict';

const { randomInt, randomUUID } = require('node:crypto');
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const ROLES = {
  5: [3, 1], 6: [4, 1], 7: [4, 2],
  8: [5, 2], 9: [5, 3], 10: [6, 3],
};
const POWERS = {
  small: [null, null, 'peek', 'execute', 'execute', null],
  medium: [null, 'investigate', 'special', 'execute', 'execute', null],
  large: ['investigate', 'investigate', 'special', 'execute', 'execute', null],
};
function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function createGame() {
  return {
    id: randomUUID(), revision: 0, phaseId: 0, status: 'lobby', phase: 'lobby',
    players: [], host: null, president: null, chancellor: null,
    previousPresident: null, previousChancellor: null, returnAfter: null,
    liberals: 0, fascists: 0, tracker: 0, deck: [], discard: [], hand: [],
    votes: {}, lastVote: null, investigated: [], power: null, vetoDenied: false,
    round: 0, log: [], winner: null, reason: null, privateNotes: {},
  };
}
const alive = g => g.players.filter(p => p.alive);
const player = (g, id) => g.players.find(p => p.id === id);
const paused = g => g.status === 'playing' && alive(g).some(p => !p.connected);
function phase(g, next) { g.phase = next; g.phaseId++; }
function note(g, text) { g.log.push({ id: g.log.length + 1, round: g.round, text }); }
function name(g, id) { return player(g, id)?.name || 'Jogador'; }
function privateNote(g, id, text) { (g.privateNotes[id] ||= []).push(text); }
function nextAlive(g, after) {
  const start = g.players.findIndex(p => p.id === after);
  for (let offset = 1; offset <= g.players.length; offset++) {
    const p = g.players[(start + offset) % g.players.length];
    if (p.alive) return p.id;
  }
}
function eligible(g) {
  return alive(g).filter(p => p.id !== g.president && p.id !== g.previousChancellor
    && (alive(g).length <= 5 || p.id !== g.previousPresident)).map(p => p.id);
}
function refill(g) {
  if (g.deck.length < 3) {
    g.deck = shuffled([...g.deck, ...g.discard]);
    g.discard = [];
  }
}
function finish(g, winner, reason) {
  g.status = 'over'; g.winner = winner; g.reason = reason;
  g.hand = []; g.power = null; phase(g, 'over'); note(g, reason);
}
function nextElection(g) {
  const anchor = g.returnAfter || g.president;
  g.returnAfter = null;
  g.president = nextAlive(g, anchor);
  g.chancellor = null; g.hand = []; g.votes = {}; g.power = null;
  g.vetoDenied = false; g.round++; phase(g, 'nomination');
}
function enact(g, policy, chaos = false) {
  g[policy === 'liberal' ? 'liberals' : 'fascists']++;
  g.tracker = 0;
  note(g, `${chaos ? 'Caos: ' : ''}política ${policy === 'liberal' ? 'liberal' : 'fascista'} aprovada.`);
  refill(g);
  if (g.liberals === 5) return finish(g, 'liberal', 'Cinco políticas liberais aprovadas.');
  if (g.fascists === 6) return finish(g, 'fascist', 'Seis políticas fascistas aprovadas.');
  const track = POWERS[g.players.length <= 6 ? 'small' : g.players.length <= 8 ? 'medium' : 'large'];
  g.power = !chaos && policy === 'fascist' ? track[g.fascists - 1] : null;
  if (g.power) phase(g, 'executive');
  else nextElection(g);
}
function failedGovernment(g) {
  g.tracker++;
  if (g.tracker === 3) {
    g.previousPresident = null; g.previousChancellor = null;
    if (!g.deck.length) refill(g);
    enact(g, g.deck.shift(), true);
  } else {
    refill(g);
    nextElection(g);
  }
}
function addPlayer(g, id, displayName) {
  fail(g.status === 'lobby', 'A partida já começou. Você pode assistir.');
  fail(g.players.length < 10, 'O lobby já tem 10 jogadores.');
  fail(!player(g, id), 'Você já está no lobby.');
  g.players.push({ id, name: displayName, connected: true, alive: true, ready: false, acknowledged: false, role: null });
  if (!g.host) g.host = id;
  g.revision++;
}
function connection(g, id, connected) {
  const p = player(g, id);
  if (!p) return;
  p.connected = connected;
  p.disconnectedAt = connected ? null : Date.now();
  if (!connected && g.status === 'lobby') p.ready = false;
  if (!player(g, g.host)?.connected) g.host = g.players.find(x => x.connected)?.id || id;
  g.revision++;
}
function action(g, id, type, data = {}) {
  const p = player(g, id);
  fail(p && p.connected, 'Entre no lobby para jogar.');
  if (type === 'leave') {
    fail(g.status !== 'playing', 'Durante a partida, seu lugar fica reservado para reconexão.');
    g.players = g.players.filter(x => x.id !== id);
    if (g.host === id) g.host = g.players.find(x => x.connected)?.id || null;
  } else if (type === 'remove-disconnected') {
    fail(g.status === 'lobby' && id === g.host, 'Só o anfitrião pode liberar vagas no lobby.');
    const target = player(g, data.target);
    fail(target && !target.connected, 'Só uma vaga desconectada pode ser liberada.');
    g.players = g.players.filter(x => x.id !== target.id);
  } else if (type === 'reset') {
    fail(id === g.host && g.status === 'over', 'Só o anfitrião pode abrir outra partida após o fim.');
    const kept = g.players.filter(x => x.connected);
    Object.assign(g, createGame(), { players: kept, host: id });
    kept.forEach(x => { x.alive = true; x.role = null; x.ready = false; x.acknowledged = false; });
  } else if (type === 'abort') {
    fail(id === g.host && g.status === 'playing', 'Só o anfitrião pode encerrar a partida.');
    finish(g, null, 'Partida encerrada pelo anfitrião, sem vencedor.');
  } else if (type === 'ready') {
    fail(g.status === 'lobby' && typeof data.ready === 'boolean', 'Ação inválida no lobby.');
    p.ready = data.ready;
  } else if (type === 'start') {
    fail(g.status === 'lobby' && g.host === id, 'Só o anfitrião pode iniciar no lobby.');
    fail(ROLES[g.players.length] && g.players.every(x => x.connected && x.ready), 'É preciso ter de 5 a 10 jogadores conectados e prontos.');
    const [liberals, fascists] = ROLES[g.players.length];
    const roles = shuffled([...Array(liberals).fill('liberal'), ...Array(fascists).fill('fascist'), 'hitler']);
    g.players.forEach((x, i) => { x.role = roles[i]; x.alive = true; x.acknowledged = false; });
    g.deck = shuffled([...Array(6).fill('liberal'), ...Array(11).fill('fascist')]);
    g.status = 'playing'; g.president = g.players[randomInt(g.players.length)].id;
    g.round = 1; phase(g, 'roles'); note(g, 'Papéis distribuídos. Confirme sua identidade em particular.');
  } else {
    fail(g.status === 'playing' && p.alive, 'Você não pode agir nesta partida.');
    fail(!paused(g), 'Partida pausada: aguardando a reconexão dos jogadores.');
    if (type === 'ack-role') {
      fail(g.phase === 'roles' && !p.acknowledged, 'Papel já confirmado.');
      p.acknowledged = true;
      if (g.players.every(x => x.acknowledged)) phase(g, 'nomination');
    } else if (type === 'nominate') {
      fail(g.phase === 'nomination' && id === g.president, 'Aguarde sua vez de indicar.');
      fail(eligible(g).includes(data.target), 'Candidato inelegível.');
      g.chancellor = data.target; g.votes = {}; phase(g, 'voting');
      note(g, `${name(g, id)} indicou ${name(g, data.target)} para chanceler.`);
    } else if (type === 'vote') {
      fail(g.phase === 'voting' && typeof data.yes === 'boolean', 'Voto inválido.');
      fail(!Object.hasOwn(g.votes, id), 'Seu voto já foi registrado.');
      g.votes[id] = data.yes;
      if (alive(g).every(x => Object.hasOwn(g.votes, x.id))) {
        const approved = Object.values(g.votes).filter(Boolean).length > alive(g).length / 2;
        g.lastVote = { round: g.round, president: g.president, chancellor: g.chancellor, votes: { ...g.votes }, approved };
        note(g, `Governo ${approved ? 'aprovado' : 'rejeitado'}: ${Object.values(g.votes).filter(Boolean).length} Ja / ${Object.values(g.votes).filter(v => !v).length} Nein.`);
        if (!approved) failedGovernment(g);
        else {
          g.previousPresident = g.president; g.previousChancellor = g.chancellor;
          if (g.fascists >= 3 && player(g, g.chancellor).role === 'hitler') {
            finish(g, 'fascist', 'Hitler foi eleito chanceler após três políticas fascistas.');
          } else {
            if (g.fascists >= 3) note(g, `${name(g, g.chancellor)} não é Hitler.`);
            refill(g); g.hand = g.deck.splice(0, 3); phase(g, 'president-discard');
          }
        }
      }
    } else if (type === 'discard') {
      fail(g.phase === 'president-discard' && id === g.president, 'Só o presidente pode descartar agora.');
      fail(Number.isInteger(data.index) && data.index >= 0 && data.index < 3, 'Carta inválida.');
      g.discard.push(g.hand.splice(data.index, 1)[0]); phase(g, 'chancellor-enact');
    } else if (type === 'enact') {
      fail(g.phase === 'chancellor-enact' && id === g.chancellor, 'Só o chanceler pode aprovar agora.');
      fail(Number.isInteger(data.index) && data.index >= 0 && data.index < 2, 'Carta inválida.');
      const selected = g.hand[data.index];
      g.discard.push(g.hand[1 - data.index]); g.hand = []; enact(g, selected);
    } else if (type === 'request-veto') {
      fail(g.phase === 'chancellor-enact' && id === g.chancellor && g.fascists >= 5 && !g.vetoDenied, 'Veto indisponível.');
      phase(g, 'veto'); note(g, 'O chanceler solicitou veto.');
    } else if (type === 'respond-veto') {
      fail(g.phase === 'veto' && id === g.president && typeof data.accept === 'boolean', 'Resposta ao veto inválida.');
      if (data.accept) {
        g.discard.push(...g.hand); g.hand = []; note(g, 'O presidente aceitou o veto.');
        refill(g);
        failedGovernment(g);
      } else {
        g.vetoDenied = true; phase(g, 'chancellor-enact'); note(g, 'O presidente recusou o veto.');
      }
    } else if (type === 'power') {
      fail(g.phase === 'executive' && id === g.president, 'Só o presidente pode usar o poder agora.');
      if (g.power === 'peek') {
        privateNote(g, id, `Rodada ${g.round} — próximas políticas: ${g.deck.slice(0, 3).map(c => c === 'liberal' ? 'Liberal' : 'Fascista').join(', ')}.`);
        note(g, 'O presidente consultou as três próximas políticas.'); nextElection(g);
      } else {
        const target = player(g, data.target);
        fail(target && target.alive && target.id !== id, 'Escolha outro jogador vivo.');
        if (g.power === 'investigate') {
          fail(!g.investigated.includes(target.id), 'Este jogador já foi investigado.');
          g.investigated.push(target.id);
          privateNote(g, id, `${target.name}: filiação ${target.role === 'liberal' ? 'Liberal' : 'Fascista'}.`);
          note(g, `${name(g, id)} investigou ${target.name}.`); nextElection(g);
        } else if (g.power === 'special') {
          g.returnAfter = id; g.president = target.id; g.chancellor = null;
          g.power = null; g.votes = {}; g.round++; g.vetoDenied = false; phase(g, 'nomination');
          note(g, `${target.name} presidirá uma eleição especial.`);
        } else if (g.power === 'execute') {
          target.alive = false; note(g, `${target.name} foi executado e não pode mais participar do debate ou votar.`);
          if (target.role === 'hitler') finish(g, 'liberal', 'Hitler foi executado.');
          else nextElection(g);
        }
      }
    } else throw new Error('Ação desconhecida.');
  }
  g.revision++;
}

module.exports = { createGame, addPlayer, connection, action, alive, player, paused, eligible, ROLES, POWERS };
