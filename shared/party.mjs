// shared/party.mjs — "Gioca insieme": a Party is a small group of friends that plays the minigames together.
// It is itself a (never ending, drop-in) server match: its id is the party code / invite link (server/match.mjs
// create { link:true }), its members are the seats. The leader picks a minigame: the client creates that match on the
// server (create { party: <party id>, wait: true }) and announces it here with { launch }; every member gets the launch in
// the view and joins it (src/net/party.js shows the prompt and teleports them to the spot). See shared/README.md.
//
// Actions:
//   { launch: { type, match, choice? } }  leader only: the match id of the lobby just opened for `type` (see GAMES)
//   { answer: { seq, yes } }               a member accepts / declines the current launch
//   { done: true }                         leader: the launched game is over (back to the menu)
//   { kick: id } · { lead: id }            leader only: remove a member / hand over the crown
//   { where: { room, world } }             where I am (room code), so friends can follow me into my room
//   { call: true }                         leader: "venite!" ping to everyone (max one every 3 actions of the leader)
// view(id): { me, leader, members:[{ id, name, st:''|'call'|'in'|'no', room, world }], launch, kicked }
export const meta = { type: 'party', name: 'Party', minPlayers: 1, maxPlayers: 8, tickHz: 0, dropIn: true };

// minigames a party can launch (ids = shared/<type>.mjs); the clients register how to open each one (src/net/party.js)
export const GAMES = {
  quiz: { name: "Chi l'ha detto? Sfida", icon: '❓', min: 1, max: 8 },
  calcetto: { name: 'Calcetto online', icon: '⚽', min: 1, max: 4 },
  gulag_coop: { name: 'Gulag profondo co-op', icon: '⛓️', min: 1, max: 4 },
  processo: { name: 'Processo del Secolo', icon: '⚖️', min: 2, max: 6 },
  sfida: { name: 'Sfida a punti', icon: '🏁', min: 1, max: 6 },
  corriere: { name: 'Corriere del party', icon: '📰', min: 1, max: 8 },
};
const MATCH_RE = /^[a-z0-9]{4,12}$/;
const clean = (s, n = 16) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export function create({ players = [], opts = {} } = {}) {
  void opts;
  const S = { members: [], leader: null, launch: null, seq: 0, ev: [], kicked: [], calls: 0, leadActs: 0 };
  const push = e => { if (S.ev.length < 50) S.ev.push(e); };
  const find = id => S.members.find(m => m.id === id);
  function add(p) {
    if (!p || p.bot || find(p.id)) return false;
    S.members.push({ id: p.id, name: clean(p.name) || 'Giocatore', st: '', room: null, world: false });
    if (!S.leader) S.leader = p.id;
    S.kicked = S.kicked.filter(k => k !== p.id);
    return true;
  }
  players.forEach(add);
  const err = error => ({ ok: false, error });
  const game = {
    act(id, a) {
      const m = find(id);
      if (!m) return err(S.kicked.includes(id) ? 'sei stato tolto dal party' : 'non sei nel party');
      if (!a || typeof a !== 'object') return err('azione');
      const lead = id === S.leader;
      if (lead) S.leadActs++;
      if (a.launch) {
        if (!lead) return err('solo il capo party sceglie il gioco');
        const L = a.launch, type = String(L.type || ''), match = String(L.match || '');
        if (!Object.prototype.hasOwnProperty.call(GAMES, type)) return err('gioco non disponibile nel party');
        if (!MATCH_RE.test(match)) return err('partita non valida');
        S.seq++;
        S.launch = { seq: S.seq, type, match, name: GAMES[type].name, icon: GAMES[type].icon, by: id, choice: clean(L.choice, 12) || null };
        for (const x of S.members) x.st = x.id === id ? 'in' : 'call';
        push({ k: 'launch', seq: S.seq, type, match, by: id });
        return { ok: true, seq: S.seq };
      }
      if (a.answer) {
        if (!S.launch || (a.answer.seq | 0) !== S.launch.seq) return err('invito scaduto');
        m.st = a.answer.yes ? 'in' : 'no';
        push({ k: 'answer', id, yes: !!a.answer.yes });
        return { ok: true };
      }
      if (a.done) {
        if (!lead) return err('solo il capo party');
        if (!S.launch) return { ok: true };
        push({ k: 'done', seq: S.launch.seq }); S.launch = null; for (const x of S.members) x.st = '';
        return { ok: true };
      }
      if (a.kick !== undefined) {
        if (!lead) return err('solo il capo party');
        const t = find(String(a.kick)); if (!t || t.id === id) return err('chi?');
        S.members.splice(S.members.indexOf(t), 1); if (!S.kicked.includes(t.id)) S.kicked.push(t.id);
        push({ k: 'kick', id: t.id, name: t.name });
        return { ok: true };
      }
      if (a.lead !== undefined) {
        if (!lead) return err('solo il capo party');
        const t = find(String(a.lead)); if (!t) return err('chi?');
        S.leader = t.id; push({ k: 'leader', id: t.id, name: t.name });
        return { ok: true };
      }
      if (a.where) {
        const room = clean(a.where.room, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
        m.room = room || null; m.world = !!a.where.world;
        return { ok: true };
      }
      if (a.call) {
        if (!lead) return err('solo il capo party');
        if (S.calls && S.leadActs - S.calls < 3) return err('hai appena chiamato');
        S.calls = S.leadActs; push({ k: 'call', by: id, name: m.name });
        return { ok: true };
      }
      return err('azione sconosciuta');
    },
    view(id) {
      return { me: id, leader: S.leader, members: S.members.map(x => ({ id: x.id, name: x.name, st: x.st, room: x.room, world: x.world })), launch: S.launch, kicked: S.kicked.includes(id) };
    },
    drain() { const e = S.ev; S.ev = []; return e; },
    join(p) { if (add(p)) { const x = find(p.id); if (S.launch) x.st = 'call'; push({ k: 'join', id: p.id, name: x.name }); } },
    leave(id) {
      const m = find(id); if (!m) return;
      S.members.splice(S.members.indexOf(m), 1); push({ k: 'leave', id, name: m.name });
      if (S.leader === id) { S.leader = S.members.length ? S.members[0].id : null; if (S.leader) push({ k: 'leader', id: S.leader, name: S.members[0].name }); }
    },
    get over() { return null; },
    _state: S,
  };
  return game;
}
