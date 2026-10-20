/* Secret Hitler UI. The server decides every legal action and every visible secret. */
(() => {
  const root = document.getElementById('secret-hitler-view');
  const roles = { liberal: 'Liberal', fascist: 'Fascista', hitler: 'Hitler' };
  const powers = { peek: 'Consultar baralho', investigate: 'Investigar filiação', special: 'Eleição especial', execute: 'Execução' };
  const phases = {
    lobby: 'Preparação', roles: 'Identidades secretas', nomination: 'Formar governo',
    voting: 'Votação', 'president-discard': 'Sessão legislativa',
    'chancellor-enact': 'Sessão legislativa', veto: 'Pedido de veto',
    executive: 'Poder presidencial', over: 'Fim de partida',
  };
  let state = null, key = '', visible = false, busy = false, lost = false;
  let privateOpen = false, handOpen = false, error = '', onChange = () => {}, reconnect = () => {}, generation = 0;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  // Small, original inline vectors: no image downloads, canvas or animation loop.
  const inkPaths = {
    liberal: 'M12 3c-7 2-8 8-5 12L5 21m2-6c7 1 12-5 12-12-6 0-10 3-12 12Zm1-1 7-7M8 11l3 1m0-5 1 3',
    fascist: 'M8 19c-6-4-4-11 2-11h5c4 0 5-5 1-5h-3m-3 5c-5 1-4 6 0 6h4c6 0 6 7 0 7H8m7-18 3 1m-4 10c-1 4-6 3-6 0',
    investigate: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    peek: 'M4 4h7c2 0 3 1 3 3v14c0-2-1-3-3-3H4V4Zm10 3c0-2 1-3 3-3h3v14h-3c-2 0-3 1-3 3M7 8h4M7 12h4M17 8h1',
    special: 'M5 5h14v14H5zM2 9l3-4 4 3m13 7-3 4-4-3M9 11h6m-3-3v6',
    execute: 'M7 16C1 11 5 3 12 3s11 8 5 13v5H7v-5Zm2-7v2m6-2v2m-4 5h2m-3 1v4m4-4v4',
    victory: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',
    seal: 'm12 2 3 4 5 1v5l2 4-4 3-1 4-5-2-5 2-1-4-4-3 2-4V7l5-1 3-4Z',
    portrait: 'M8 9a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 22v-3c0-4 16-4 16 0v3M9 16l3 5 3-5',
  };
  function ink(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'sh-ink');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.35');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', inkPaths[type] || inkPaths.seal); svg.append(path);
    return svg;
  }
  function paperCard(party, label, small = false) {
    const card = el('div', `sh-paper-card ${party} ${small ? 'compact' : ''}`);
    card.append(el('small', 'sh-card-kicker', 'POLÍTICA'), ink(party), el('strong', '', label));
    return card;
  }
  const who = id => state?.players.find(p => p.id === id)?.name || '—';
  const me = () => state?.players.find(p => p.id === state.you);
  const tokenKey = () => `telinhafix-sh-session:${key}`;
  function token() { try { return localStorage.getItem(tokenKey()); } catch { return null; } }
  function saveToken(value) { try { if (value) localStorage.setItem(tokenKey(), value); else localStorage.removeItem(tokenKey()); } catch {} }
  function button(text, handler, kind = '', disabled = false) {
    const b = el('button', `sh-btn ${kind}`, text);
    b.type = 'button'; b.disabled = disabled || busy;
    b.addEventListener('click', handler);
    return b;
  }
  function receive(next) {
    if (!next) return;
    if (state && state.id === next.id && state.revision > next.revision) return;
    if (state?.id !== next.id) privateOpen = false;
    if (state?.phaseId !== next.phaseId || state?.id !== next.id) handOpen = false;
    state = next; render(); onChange();
  }
  async function run(operation) {
    if (busy || lost) return;
    const epoch = generation;
    busy = true; error = ''; render();
    try {
      const res = await operation();
      if (epoch !== generation) return;
      if (res.token) saveToken(res.token);
      receive(res.state);
    } catch (err) {
      if (epoch !== generation) return;
      error = err.message;
      try {
        const res = await window.secretHitler.getState();
        if (epoch === generation) receive(res.state);
      } catch {}
    } finally {
      if (epoch === generation) { busy = false; render(); }
    }
  }
  function act(type, data = {}) {
    return run(async () => {
      const result = await window.secretHitler.action({
        type, data, gameId: state.id, phaseId: state.phaseId, requestId: crypto.randomUUID(),
      });
      if (type === 'leave') saveToken(null);
      return result;
    });
  }
  function section(title) {
    const box = el('section', 'sh-panel');
    box.append(el('h3', '', title));
    return box;
  }
  function renderLobby(body) {
    const box = section('Uma mesa. Duas lealdades.');
    box.append(el('p', 'sh-muted', 'De 5 a 10 jogadores. Entre, marque-se como pronto e aguarde o anfitrião. Quem não entrar pode assistir sem receber papéis.'));
    const row = el('div', 'sh-actions');
    if (!me()) row.append(button('Entrar no lobby', () => run(() => window.secretHitler.join()), '', state.players.length >= 10));
    else {
      row.append(button(me().ready ? 'Não estou pronto' : 'Estou pronto', () => act('ready', { ready: !me().ready })));
      row.append(button('Assistir', () => act('leave'), 'secondary'));
      if (state.host === state.you) row.append(button('Distribuir papéis', () => act('start'), '',
        state.players.length < 5 || !state.players.every(p => p.ready && p.connected)));
    }
    box.append(row);
    box.append(el('p', 'sh-muted', `${state.players.filter(p => p.ready && p.connected).length}/${state.players.length} prontos • anfitrião: ${who(state.host)}`));
    body.append(box);
  }
  function renderPlayers(body) {
    const box = section(`À mesa · ${state.players.length}`);
    const grid = el('div', 'sh-players');
    for (const p of state.players) {
      const card = el('div', `sh-person ${!p.alive ? 'dead' : ''} ${p.id === state.you ? 'is-you' : ''}`);
      const badge = el('span', 'sh-avatar', p.name.slice(0, 2).toUpperCase());
      const info = el('div');
      info.append(el('strong', '', p.name + (p.id === state.you ? ' · você' : '')));
      const labels = [];
      if (!p.connected) labels.push('Desconectado');
      if (!p.alive) labels.push('Eliminado');
      if (state.status === 'lobby') labels.push(p.ready ? 'Pronto' : 'Preparando');
      else {
        if (p.id === state.president) labels.push('Presidente');
        if (p.id === state.chancellor) labels.push('Chanceler');
        if (state.phase === 'roles') labels.push(p.acknowledged ? 'Papel confirmado' : 'Lendo papel');
      }
      if (state.status === 'over' && p.role) labels.push(roles[p.role]);
      info.append(el('small', '', labels.join(' · ') || 'Na mesa'));
      card.append(badge, info);
      if (state.status !== 'lobby') {
        const back = el('span', 'sh-mini-role');
        back.setAttribute('aria-label', state.status === 'over' ? roles[p.role] || 'Papel' : 'Papel secreto');
        back.append(ink(state.status === 'over' ? p.role === 'hitler' ? 'portrait' : p.role : 'seal'));
        card.append(back);
      }
      if (state.status === 'lobby' && state.you === state.host && !p.connected) {
        card.append(button('Liberar vaga', () => act('remove-disconnected', { target: p.id }), 'secondary'));
      }
      grid.append(card);
    }
    box.append(grid); body.append(box);
  }
  function renderBoard(body) {
    const board = el('section', 'sh-board');
    board.setAttribute('aria-label', 'Tabuleiro de políticas');
    const tableTop = el('div', 'sh-table-top');
    function pile(label, count, discarded) {
      const pile = el('div', `sh-pile ${discarded ? 'discarded' : ''}`);
      const back = el('div', 'sh-deck-back'); back.append(ink('seal'), el('strong', '', 'SECRET\nHITLER'));
      pile.append(back, el('span', '', label), el('b', 'sh-pile-count', String(count)));
      return pile;
    }
    const offices = el('div', 'sh-offices');
    for (const [title, id] of [['PRESIDENTE', state.president], ['CHANCELER', state.chancellor]]) {
      const office = el('div', 'sh-office');
      office.append(el('small', '', title), el('strong', '', id ? who(id) : 'A definir'));
      offices.append(office);
    }
    tableTop.append(pile('COMPRA', state.deckCount, false), offices, pile('DESCARTE', state.discardCount, true));
    board.append(tableTop);
    for (const [party, count, total, title] of [
      ['liberal', state.liberals, 5, 'LIBERAIS'], ['fascist', state.fascists, 6, 'FASCISTAS'],
    ]) {
      const lane = el('div', `sh-track ${party}`);
      const heading = el('div', 'sh-track-heading');
      const crest = el('span', 'sh-crest'); crest.append(ink(party));
      const trackTitle = el('div', 'sh-track-title');
      trackTitle.append(el('small', '', 'TRILHA DE POLÍTICAS'), el('strong', '', title));
      heading.append(crest, trackTitle, el('span', 'sh-track-score', `${count} / ${total}`));
      lane.append(heading);
      const cells = el('div', 'sh-track-cells');
      for (let i = 0; i < total; i++) {
        const cell = el('div', `sh-policy-slot ${i < count ? 'filled' : ''}`);
        cell.setAttribute('aria-label', `${title}: casa ${i + 1}${i < count ? ', política aprovada' : ', vazia'}`);
        if (i < count) cell.append(paperCard(party, roles[party], true));
        else {
          cell.append(el('b', 'sh-slot-number', String(i + 1)));
          cell.append(ink(i === total - 1 ? 'victory' : party === 'fascist' ? state.powers[i] || 'seal' : 'liberal'));
          cell.append(el('small', '', i === total - 1 ? 'VITÓRIA' : party === 'fascist' ? powers[state.powers[i]] || 'Sem poder' : 'Aprovar política'));
        }
        cells.append(cell);
      }
      lane.append(cells);
      const foot = el('div', 'sh-track-foot');
      foot.append(el('span', '', party === 'liberal' ? '5 POLÍTICAS LIBERAIS = VITÓRIA' : 'HITLER CHANCELER APÓS A 3ª POLÍTICA = VITÓRIA'));
      if (party === 'fascist') foot.append(el('span', '', 'VETO A PARTIR DA 5ª'));
      lane.append(foot); board.append(lane);
    }
    const tracker = el('div', 'sh-election-track');
    const explanation = el('div');
    explanation.append(el('strong', '', 'MARCADOR ELEITORAL'), el('small', '', 'Três governos rejeitados ou vetados → política do topo.'));
    const markers = el('div', 'sh-election-spaces');
    markers.setAttribute('aria-label', `Instabilidade eleitoral: ${state.tracker} de 3`);
    for (let i = 0; i <= 3; i++) {
      const space = el('span', `sh-election-space ${state.tracker === i ? 'current' : ''}`, i === 3 ? 'CAOS' : String(i));
      if (state.tracker === i) space.append(el('i', 'sh-pawn'));
      markers.append(space);
    }
    tracker.append(explanation, markers); board.append(tracker);
    body.append(board);
  }
  function renderPrivate(body) {
    if (!state.secret || state.status === 'over') return;
    const box = section('Seu envelope');
    box.append(button(privateOpen ? 'Ocultar informações privadas' : 'Ver meu papel e anotações',
      () => { privateOpen = !privateOpen; render(); }, 'secondary'));
    if (privateOpen) {
      const secret = el('div', `sh-secret ${state.secret.role}`);
      const roleCard = el('div', `sh-role-card ${state.secret.role}`);
      roleCard.append(el('small', '', 'IDENTIDADE SECRETA'), ink(state.secret.role === 'hitler' ? 'portrait' : state.secret.role),
        el('strong', '', roles[state.secret.role]), el('small', '', 'SOMENTE VOCÊ PODE VER'));
      secret.append(roleCard);
      secret.append(el('strong', '', `Você é ${roles[state.secret.role]}.`));
      secret.append(el('p', '', state.secret.role === 'liberal'
        ? 'Aprove 5 políticas liberais ou descubra e execute Hitler.'
        : 'Aprove 6 políticas fascistas ou eleja Hitler chanceler após 3 políticas fascistas.'));
      if (state.secret.allies.length) {
        secret.append(el('p', '', 'Você conhece: ' + state.secret.allies.map(p => `${p.name} (${roles[p.role]})`).join(' · ')));
      } else if (state.secret.role === 'hitler') {
        secret.append(el('p', '', 'Nesta mesa, você não sabe quem são os outros fascistas.'));
      }
      for (const text of state.secret.notes) secret.append(el('p', 'sh-note', text));
      box.append(secret);
    } else {
      const envelope = el('div', 'sh-envelope');
      envelope.setAttribute('aria-hidden', 'true');
      envelope.append(el('span', 'sh-envelope-line', 'CONFIDENCIAL'), ink('seal'), el('small', '', 'Sua lealdade está aqui.'));
      box.append(envelope);
    }
    box.append(el('small', 'sh-muted', 'Informações privadas são ocultadas ao fechar o jogo ou sair desta janela. Não compartilhe sua tela ao revelá-las.'));
    body.append(box);
  }
  function targetButtons(box, ids, type, confirmExecution = false) {
    const choices = el('div', 'sh-actions');
    for (const id of ids) choices.append(button(who(id), () => {
      if (confirmExecution && !confirm(`Executar ${who(id)}? A decisão é definitiva nesta partida.`)) return;
      act(type, { target: id });
    }, confirmExecution ? 'danger' : 'secondary'));
    box.append(choices);
  }
  function renderAction(body) {
    const box = section(phases[state.phase] || 'Aguardando');
    if (lost) {
      box.append(el('p', '', 'A conexão caiu. Seu lugar e papel estão reservados. Retorne à mesma sala para continuar.'));
      box.append(button('Reconectar à sala', reconnect)); body.append(box); return;
    }
    if (state.paused) {
      box.append(el('p', '', `Partida pausada. Aguardando: ${state.players.filter(p => p.alive && !p.connected).map(p => p.name).join(', ')}.`));
    } else if (state.phase === 'roles') {
      box.append(el('p', '', 'Abra seu envelope em particular e confirme que leu seu papel.'));
      if (me() && !me().acknowledged) box.append(button('Li meu papel', () => act('ack-role'), '', !privateOpen));
    } else if (state.phase === 'nomination') {
      box.append(el('p', '', `${who(state.president)} deve indicar um chanceler elegível.`));
      if (state.you === state.president) targetButtons(box, state.eligible, 'nominate');
    } else if (state.phase === 'voting') {
      box.append(el('p', 'sh-government', `${who(state.president)} + ${who(state.chancellor)}`));
      box.append(el('p', '', `${state.voteCount} de ${state.players.filter(p => p.alive).length} votos recebidos. Os votos são revelados juntos.`));
      if (me()?.alive && state.yourVote === null) {
        const row = el('div', 'sh-actions');
        row.classList.add('sh-ballots');
        row.append(button('JA! · Aprovar', () => act('vote', { yes: true }), 'yes sh-ballot'),
          button('NEIN · Rejeitar', () => act('vote', { yes: false }), 'danger sh-ballot'));
        box.append(row);
      } else if (state.yourVote !== null) box.append(el('p', 'sh-muted', `Seu voto: ${state.yourVote ? 'Ja' : 'Nein'}. Aguardando a mesa.`));
    } else if (['president-discard', 'chancellor-enact'].includes(state.phase)) {
      const discarding = state.phase === 'president-discard';
      box.append(el('p', '', discarding
        ? `${who(state.president)} deve descartar uma das três políticas.`
        : `${who(state.chancellor)} deve aprovar uma das duas políticas.`));
      box.append(el('p', 'sh-muted', 'Durante esta etapa, presidente e chanceler não devem se comunicar.'));
      if (state.secret?.hand.length) {
        box.append(button(handOpen ? 'Ocultar cartas' : 'Revelar minhas cartas', () => { handOpen = !handOpen; render(); }, 'secondary'));
        if (handOpen) {
          const cards = el('div', 'sh-hand');
          state.secret.hand.forEach((card, index) => {
            const policyButton = button('', () => {
              if (confirm(`${discarding ? 'Descartar' : 'Aprovar'} esta política ${roles[card].toLowerCase()}?`)) {
                act(discarding ? 'discard' : 'enact', { index });
              }
            }, `sh-card ${card}`);
            policyButton.setAttribute('aria-label', `${discarding ? 'Descartar' : 'Aprovar'} política ${roles[card]} ${index + 1}`);
            policyButton.append(paperCard(card, roles[card]), el('span', 'sh-card-action', discarding ? 'Descartar esta carta' : 'Aprovar esta carta'));
            cards.append(policyButton);
          });
          box.append(cards);
        }
        if (state.vetoAvailable) box.append(button('Solicitar veto', () => act('request-veto'), 'secondary'));
      }
    } else if (state.phase === 'veto') {
      box.append(el('p', '', 'O chanceler pediu veto. O presidente deve aceitar ou recusar.'));
      if (state.you === state.president) {
        box.append(button('Aceitar veto', () => act('respond-veto', { accept: true })),
          button('Recusar veto', () => act('respond-veto', { accept: false }), 'secondary'));
      }
    } else if (state.phase === 'executive') {
      box.append(el('p', '', `${who(state.president)} deve usar: ${powers[state.power]}.`));
      if (state.you === state.president) {
        if (state.power === 'peek') box.append(button('Consultar próximas políticas', () => act('power')));
        else targetButtons(box, state.players.filter(p => p.alive && p.id !== state.president
          && (state.power !== 'investigate' || !state.investigated.includes(p.id))).map(p => p.id), 'power', state.power === 'execute');
      }
      box.append(el('p', 'sh-muted', 'Resultados privados ficam no envelope do presidente. Investigações mostram a filiação, nunca o papel de Hitler.'));
    } else if (state.status === 'over') {
      box.append(el('p', 'sh-government', state.winner ? `${state.winner === 'liberal' ? 'Liberais' : 'Fascistas'} venceram` : 'Partida encerrada'));
      box.append(el('p', '', state.reason));
      if (state.you === state.host) box.append(button('Novo lobby', () => act('reset')));
      if (me()) box.append(button('Sair da mesa', () => act('leave'), 'secondary'));
    }
    if (me() && !me().alive && state.status === 'playing') box.append(el('p', 'sh-muted', 'Você foi eliminado. Acompanhe em silêncio, sem votar ou revelar informações.'));
    if (!me() && state.status === 'playing') box.append(el('p', 'sh-muted', 'Você está assistindo. Poderá entrar na próxima partida.'));
    body.append(box);
  }
  function render() {
    if (!visible) return;
    root.replaceChildren();
    const shell = el('div', 'sh-shell');
    const header = el('header', 'sh-header');
    const title = el('div');
    title.append(el('span', 'sh-eyebrow', 'TELINHAFIX · DEDUÇÃO SOCIAL'), el('h2', '', 'SECRET HITLER'));
    header.append(title, el('span', 'sh-round', state?.status === 'playing' ? `RODADA ${state.round}` : '5–10 JOGADORES'));
    shell.append(header);
    if (error) {
      const alert = el('p', 'sh-error', error); alert.setAttribute('role', 'alert'); shell.append(alert);
    }
    if (!state) shell.append(el('p', 'sh-muted', 'Carregando a mesa…'));
    else if (state.status === 'idle') {
      const box = section('Em quem você confia?');
      box.append(el('p', '', 'Forme governos, aprove políticas e descubra quem está escondendo a própria lealdade.'));
      if (lost) box.append(button('Reconectar à sala', reconnect));
      else box.append(button('Abrir lobby', () => run(() => window.secretHitler.join())));
      shell.append(box);
    } else {
      if (state.status === 'lobby' && !lost) renderLobby(shell);
      renderBoard(shell);
      if (state.status !== 'lobby' || lost) renderAction(shell);
      renderPrivate(shell);
      renderPlayers(shell);
      if (state.lastVote) {
        const box = section(`Última votação · rodada ${state.lastVote.round}`);
        box.append(el('p', '', `${who(state.lastVote.president)} + ${who(state.lastVote.chancellor)}: ${state.lastVote.approved ? 'aprovados' : 'rejeitados'}`));
        box.append(el('p', 'sh-muted', Object.entries(state.lastVote.votes).map(([id, yes]) => `${who(id)}: ${yes ? 'Ja' : 'Nein'}`).join(' · ')));
        shell.append(box);
      }
      if (state.log?.length) {
        const details = el('details', 'sh-panel');
        details.append(el('summary', '', 'Histórico público'));
        for (const entry of state.log.slice().reverse()) details.append(el('p', 'sh-log', `R${entry.round} · ${entry.text}`));
        shell.append(details);
      }
      if (state.status === 'playing' && state.you === state.host) shell.append(button('Encerrar partida', () => {
        if (confirm('Encerrar a partida para todos, sem vencedor e revelando os papéis?')) act('abort');
      }, 'secondary'));
    }
    const help = el('details', 'sh-panel sh-help');
    help.append(el('summary', '', 'Como jogar'));
    help.append(el('p', '', 'Liberais vencem com 5 políticas liberais ou a execução de Hitler. Fascistas vencem com 6 políticas fascistas ou Hitler eleito chanceler depois da terceira política fascista.'));
    help.append(el('p', '', 'O presidente indica um chanceler. Todos os vivos votam; empate rejeita. Governo aprovado: o presidente recebe 3 políticas e descarta 1; o chanceler aprova 1 das 2 restantes. Três governos rejeitados ou vetados sem aprovar uma política provocam caos: a próxima política entra sem ativar poderes.'));
    help.append(el('p', '', 'A última dupla eleita não pode ser indicada a chanceler; com 5 vivos ou menos, só o último chanceler fica impedido. Após 5 políticas fascistas, o chanceler pode pedir veto: ambos precisam concordar. Um veto aceito aumenta a instabilidade eleitoral.'));
    help.append(el('p', '', 'Use a conversa por voz que preferir. O app não inclui microfone. Mentir sobre seu papel e informações privadas faz parte do jogo; jogadores eliminados devem permanecer em silêncio.'));
    shell.append(help);
    const credit = el('footer', 'sh-credit', 'Adaptação digital não oficial · Regras de Mike Boxleiter, Tommy Maranges e Mac Schubert · CC BY-NC-SA 4.0 · Interface e implementação próprias.');
    shell.append(credit);
    root.append(shell);
  }
  window.SecretHitlerUI = {
    async connect(sessionKey, changed, reconnectRoom) {
      generation++; key = sessionKey; onChange = changed; reconnect = reconnectRoom || (() => location.reload());
      state = null; lost = false; error = ''; busy = false; privateOpen = false; handOpen = false;
      const epoch = generation;
      window.secretHitler.onState(next => { if (epoch === generation) receive(next); });
      try {
        const res = await window.secretHitler.getState();
        if (epoch !== generation) return;
        receive(res.state);
        if (token()) {
          try {
            const restored = await window.secretHitler.join(token());
            if (epoch === generation) receive(restored.state);
          } catch (err) {
            if (epoch !== generation) return;
            error = err.message;
            if (err.message.includes('expirou')) saveToken(null);
          }
        }
      } catch (err) { if (epoch === generation) error = 'Secret Hitler indisponível neste servidor. Atualize também o servidor. ' + err.message; }
      render();
    },
    show() {
      visible = true; root.classList.remove('hidden');
      document.getElementById('game-overlay').classList.add('sh-open'); render();
      run(() => window.secretHitler.getState());
    },
    hide() {
      visible = false; privateOpen = false; handOpen = false; root.replaceChildren();
      root.classList.add('hidden'); document.getElementById('game-overlay').classList.remove('sh-open');
    },
    reset() {
      generation++; state = null; busy = false; lost = false; error = ''; this.hide();
    },
    disconnected() { lost = true; privateOpen = false; handOpen = false; busy = false; render(); },
    active: () => !!state && ['lobby', 'playing'].includes(state.status),
  };
  window.addEventListener('blur', () => { privateOpen = false; handOpen = false; render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { privateOpen = false; handOpen = false; render(); }
  });
})();
