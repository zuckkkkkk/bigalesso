// rpg/quests.js — missions from the friends, in their voice: kill N in an area, bring something back, deliver to another
// friend, win a minigame, ride the Vespa somewhere, find a legendary. Template text with the friend's catchphrases;
// window.__ai rephrases it in the persona's voice when a provider is available (offline fallback = the template).
// Quest: { id, giver, type, title, desc, step, need, have, state:'active'|'ready', target:{anchor|npc|zone}, reward:{xp,euro,loot},
//   data, ts } — stored in the rpg state (persistent).
import { PERSONAS, persona, personaPrompt, emitEvent } from '../ai.js';
import { xpNeed, uid, RANK } from './data.js';

const rnd = a => a[(Math.random() * a.length) | 0];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const FRIENDS = PERSONAS.filter(p => p.id !== 'zuck').map(p => p.id);
const HOME = { asche: 'millennium', ashish: 'sushi', forla: 'discord', seghino: 'checkpoint', ciccio: 'edicola', parme: 'sushi', lombu: 'petroni', cesco: 'celtic', ricky: 'discord', jacopo: 'teletubby', mirco: 'petroni' };
const TASTE = { // weighted quest types per friend
  cesco: { fetch: 3, kill: 2, deliver: 2, minigame: 1, vespa: 1, legendary: 1 }, seghino: { kill: 4, minigame: 2, vespa: 1, fetch: 1, legendary: 1 },
  ashish: { minigame: 3, fetch: 2, deliver: 1, kill: 1, legendary: 1 }, forla: { minigame: 3, kill: 2, legendary: 1, deliver: 1 },
  ciccio: { fetch: 3, deliver: 2, vespa: 1, minigame: 1 }, lombu: { vespa: 2, kill: 2, fetch: 2, legendary: 1 }, asche: { vespa: 2, fetch: 2, deliver: 2, kill: 1 },
  parme: { fetch: 2, minigame: 2, deliver: 2, kill: 1 }, ricky: { minigame: 2, deliver: 2, fetch: 1, legendary: 1 }, jacopo: { vespa: 2, kill: 2, fetch: 2 },
  mirco: { legendary: 2, kill: 2, fetch: 1, deliver: 1, vespa: 1 },
};
const KILL = [
  { zone: 'Teletubbylandia', anchor: 'teletubby', who: 'gli zombi del colle', name: 'Teletubbylandia' },
  { zone: 'Via Petroni', anchor: 'petroni', who: 'gli zombi che pisciano sotto il portico', name: 'Via Petroni' },
  { zone: 'Piazzetta', anchor: 'piazzetta', who: 'i piccioni zombi dell\'edicola', name: 'piazzetta', pigeons: true },
  { zone: 'Via Teletubbylandia', anchor: 'street', who: 'gli zombi col monopattino', name: 'Via Teletubbylandia' },
  { zone: 'Checkpoint', anchor: 'checkpoint', who: 'le guardie zombi della zona demilitarizzata', name: 'checkpoint' },
];
const FETCH = [
  { key: 'birra', name: 'una pinta del Celtic', icon: '🍺', anchor: 'celtic_bar' },
  { key: 'corriere', name: 'il Corriere dall\'edicola', icon: '📰', anchor: 'edicola' },
  { key: 'uramaki', name: 'due uramaki dal sushi', icon: '🍣', anchor: 'sushi_conveyor' },
  { key: 'cuffie', name: 'le cuffie lasciate da Ashish', icon: '🎧', anchor: 'ashish_room' },
  { key: 'gratta', name: 'un gratta e vinci', icon: '🎟️', anchor: 'edicola' },
  { key: 'vinile', name: 'un vinile dal DJ del Millennium', icon: '💿', anchor: 'millennium_dj' },
  { key: 'fiore', name: 'un fiore di Teletubbylandia', icon: '🌼', anchor: 'teletubby' },
  { key: 'passaporto', name: 'il passaporto lasciato al checkpoint', icon: '🛂', anchor: 'checkpoint' },
  { key: 'joypad', name: 'il joypad dimenticato da Seghino', icon: '🎮', anchor: 'seghino_room' },
];
const DELIVER = [{ name: 'una birra', icon: '🍺' }, { name: 'il caricabatterie', icon: '🔌' }, { name: 'le chiavi della Vespa', icon: '🔑' }, { name: 'un tortellino avanzato', icon: '🥟' },
  { name: 'la maglia del calcetto', icon: '👕' }, { name: 'un mazzo di carte', icon: '🃏' }, { name: 'il pacco di Amazon', icon: '📦' }];
const GAMES = [
  { kind: 'sushi', name: 'Sushi all you can eat', text: 'arrivare primo all\'all you can eat', anchor: 'sushi_conveyor', win: /primo/ },
  { kind: 'discord', name: 'Compettina Discord', text: 'vincere la compettina su Discord', anchor: 'discord', win: /ha vinto/ },
  { kind: 'zombata', name: 'Zombata', text: 'arrivare almeno all\'ondata 3 alla Zombata', anchor: 'zombata', win: /sopravvissuto|ondata ([3-9]|\d\d)/ },
  { kind: 'quiz', name: 'Chi l\'ha detto?', text: 'fare almeno 4 risposte giuste a «Chi l\'ha detto?» (dal telefono)', anchor: null, win: /: ([4-9]|\d\d)\// },
  { kind: 'processo', name: 'Processo AI', text: 'farti assolvere al Processo AI (dal telefono)', anchor: null, win: /innocente/ },
];
const RIDES = [
  { anchor: 'millennium_door', name: 'il Millennium' }, { anchor: 'checkpoint', name: 'il checkpoint' }, { anchor: 'teletubby', name: 'Teletubbylandia' },
  { anchor: 'piazzetta', name: 'la piazzetta' }, { anchor: 'celtic_door', name: 'il Celtic' }, { anchor: 'bellazzi', name: 'Bellazzi' }, { anchor: 'sushi_door', name: 'il sushi' },
];
const QCOL = { kill: '#ff5a4f', fetch: '#5ff7ff', deliver: '#7dff8a', minigame: '#ff3d7f', vespa: '#ffd25a', legendary: '#ffb52e' };

// lines (the friend's catchphrase goes in {cp}); parolacce sì, niente insulti pesanti
const L = {
  kill: [
    (q, d) => `{cp}. A ${d.name} ci sono ${d.who} che rompono il cazzo. Stendine ${q.need}, con quello che hai.`,
    (q, d) => `Ascolta: ${d.who}, ${d.name}. ${q.need} da sistemare. Acqua, tortellini, ombrellate, fai tu.`,
    (q, d) => `Mi hanno rotto i coglioni ${d.who} a ${d.name}. Me ne togli di mezzo ${q.need}? Poi offro io. Forse.`,
  ],
  fetch: [
    (q, d) => `{cp}. Mi porti ${d.name}? Sono a secco, porca troia.`,
    (q, d) => `Fammi un favore: ${d.name}. Te lo ripago, giuro. Prima o poi.`,
    (q, d) => `Senti, mi serve ${d.name}. Vai e torna, non fare il coglione.`,
  ],
  deliver: [
    (q, d) => `Porta ${d.name} a ${q.data.toName}, che io non ho voglia di alzarmi. {cp}.`,
    (q, d) => `Questo è per ${q.data.toName}: ${d.name}. Non aprirlo, non usarlo, non fare cazzate.`,
    (q, d) => `{cp}. Mi fai da corriere? ${cap(d.name)} a ${q.data.toName}, subito.`,
  ],
  minigame: [
    (q, d) => `Scommettiamo che non riesci a ${d.text}? Dai, fammi vedere, campione.`,
    (q, d) => `{cp}. Ti sfido: ${d.text}. Se ce la fai ti pago da bere.`,
  ],
  vespa: [
    (q, d) => `Prendi una Vespa e vai fino a ${d.name}. Voglio vedere se ci arrivi intero.`,
    (q, d) => `Giro in Vespa: ${d.name}. Senza casco no, eh. Scherzo, vai. {cp}.`,
  ],
  legendary: [
    (q, d) => `Dicono che in giro ci sia roba ${d.rar}. Trovane una e poi ne parliamo, burdèl.`,
    (q, d) => `Trovami un'arma ${d.rar}. Sì, proprio quella che brilla. {cp}.`,
  ],
};
const DONE = ['Grande! {cp}.', 'Sei un mito, porca miseria.', 'Ecco, così si fa. {cp}.', 'Godo. Tieni, te lo sei meritato.', 'Pazzo sgravato. Prendi questo.'];
const NOPE = ['Per ora niente, ripassa dopo. {cp}.', 'Niente da fare, sto in pausa. Vai va.', 'Boh, adesso no. Più tardi forse.'];
const BUSY = ['Hai già un sacco di roba da fare, finisci quella prima, coglione.', 'Prima chiudi le missioni che hai, poi ne parliamo.'];

export function createQuests(R) {
  const S = () => R.state;
  const nameOf = id => (persona(id) || {}).name || id;
  const fill = (id, s) => s.replace('{cp}', cap(rnd((persona(id) || {}).catchphrases || ['daje'])));
  const anchorPos = k => { const a = R.level && R.level.anchors && R.level.anchors[k]; return a ? { x: a.x, z: a.z } : null; };
  const active = () => S().quests;
  const byId = id => active().find(q => q.id === id);
  function rewardFor(type) {
    const Lv = S().level, k = { kill: 0.42, fetch: 0.3, deliver: 0.28, minigame: 0.38, vespa: 0.3, legendary: 0.5 }[type] || 0.3;
    return { xp: Math.round(xpNeed(Lv) * k), euro: Math.round((18 + Lv * 7) * (0.8 + Math.random() * 0.5)), loot: type === 'legendary' || type === 'kill' || Math.random() < 0.55 };
  }
  function make(giver) {
    const taste = TASTE[giver] || { fetch: 1, kill: 1, deliver: 1 };
    const types = Object.keys(taste).filter(t => !active().some(q => q.type === t && t !== 'fetch' && t !== 'kill'));
    let sum = 0; for (const t of types) sum += taste[t]; let r = Math.random() * sum, type = types[0];
    for (const t of types) { r -= taste[t]; if (r <= 0) { type = t; break; } }
    const q = { id: uid('q'), giver, type, need: 1, have: 0, state: 'active', target: {}, data: {}, ts: Date.now(), color: QCOL[type] };
    let d;
    if (type === 'kill') { d = rnd(KILL); q.need = 4 + ((Math.random() * 5) | 0); q.data = { k: KILL.indexOf(d) }; q.target = { anchor: d.anchor, zone: d.zone }; q.title = `Ripulisci ${d.name}`; q.desc = `Stendi ${q.need} nemici a ${d.name}`; }
    else if (type === 'fetch') { d = rnd(FETCH.filter(f => anchorPos(f.anchor))); if (!d) return null; q.data = { k: FETCH.indexOf(d) }; q.target = { anchor: d.anchor }; q.title = `${cap(d.name.replace(/^(una|un|il|la|le|i|gli|due|lo) /, ''))} per ${nameOf(giver)}`; q.desc = `Recupera ${d.name} e portalo a ${nameOf(giver)}`; q.item = { name: d.name, icon: d.icon }; }
    else if (type === 'deliver') { d = rnd(DELIVER); const to = rnd(FRIENDS.filter(x => x !== giver)); q.data = { to, toName: nameOf(to), k: DELIVER.indexOf(d) }; q.target = { npc: to }; q.title = `Consegna a ${nameOf(to)}`; q.desc = `Porta ${d.name} a ${nameOf(to)}`; q.item = { name: d.name, icon: d.icon }; }
    else if (type === 'minigame') { d = rnd(GAMES); q.data = { k: GAMES.indexOf(d) }; q.target = d.anchor ? { anchor: d.anchor } : {}; q.title = `Sfida: ${d.name}`; q.desc = cap(d.text); }
    else if (type === 'vespa') { const here = R.playerPos(); const far = RIDES.filter(x => { const p = anchorPos(x.anchor); return p && (!here || Math.hypot(p.x - here.x, p.z - here.z) > 30); }); d = rnd(far.length ? far : RIDES); q.data = { k: RIDES.indexOf(d) }; q.target = { anchor: d.anchor }; q.title = `In Vespa fino a ${d.name}`; q.desc = `Arriva a ${d.name} in sella a una Vespa`; }
    else { const leg = S().level >= 8; d = { rar: leg ? 'leggendaria' : 'epica (o meglio)', min: leg ? 4 : 3 }; q.data = { min: d.min }; q.title = leg ? 'Caccia al leggendario' : 'Caccia all\'epico'; q.desc = `Trova un'arma o un accessorio ${d.rar}`; }
    q.reward = rewardFor(type); q.line = fill(giver, rnd(L[type])(q, d)); q.step = q.desc;
    return q;
  }
  async function voice(id, line, desc) {
    const A = window.__ai; if (!A || !A.status || A.status() === 'offline') return line;
    try {
      const r = await Promise.race([
        A.ask({ system: personaPrompt(id), prompt: `Nel gioco chiedi a Zuck (il tuo amico) di fare questa missione: «${desc}». Scrivi UNA sola battuta parlata, massimo 28 parole, nel tuo stile da chat, puoi usare qualche parolaccia leggera. Deve restare chiaro cosa deve fare. Solo la battuta, senza virgolette.`, model: 'fast', maxTokens: 90, persona: id, cache: false, fallback: line }),
        new Promise(res => setTimeout(() => res(line), 6000)),
      ]);
      const t = String(r || '').replace(/^["«\s]+|["»\s]+$/g, '').trim();
      return t && t.length < 260 ? t : line;
    } catch (e) { return line; }
  }

  // ---------------------------------------------------------------- dialogue hook (npcs.js option 6)
  async function offer(npcId) {
    // 1) turn-ins first: a fetch quest ready for this giver, or a delivery for this friend
    const tin = active().find(q => (q.type === 'fetch' && q.state === 'ready' && q.giver === npcId) || (q.type === 'deliver' && q.data.to === npcId));
    if (tin) {
      const line = tin.type === 'deliver' ? fill(npcId, rnd([`Oh, ${tin.item.name} da parte di ${nameOf(tin.giver)}? Grazie burdèl. {cp}.`, `Finalmente! ${cap(tin.item.name)}. ${nameOf(tin.giver)} è sempre in ritardo, tu no.`, `Ah ecco ${tin.item.name}. {cp}, sei un grande.`]))
        : fill(npcId, rnd([`Oh, ${tin.item.name}! {cp}.`, `Me l'hai portato davvero? Godo.`, `${cap(tin.item.name)}, finalmente. Dammi qua.`]));
      return { line, choices: ['Tieni, è tuo', 'Ci vediamo!'], choose: t => { if (/^tieni/i.test(t)) { complete(tin, npcId); return { line: fill(npcId, rnd(DONE)), choices: ['Ci vediamo!', 'Hai altro da fare?'] }; } return null; } };
    }
    const mine = active().find(q => q.giver === npcId);
    if (mine) return { line: fill(npcId, rnd([`Allora, ${mine.desc.toLowerCase()}? Muoviti, {cp}.`, `Ancora qui? Ti ho detto: ${mine.desc.toLowerCase()}.`, `${cap(mine.desc)}. Non è difficile, dai.`])), choices: ['Ci sto lavorando', 'Lascio perdere', 'Ci vediamo!'], choose: t => { if (/^lascio/i.test(t)) { abandon(mine.id); return { line: fill(npcId, rnd(['Come vuoi, coglione. {cp}.', 'Lo sapevo, sei un bidone.', 'Vabbè, lo faccio io. Come sempre.'])), choices: ['Ci vediamo!'] }; } return { line: fill(npcId, rnd(['Daje.', 'Vai vai.', '{cp}.'])), choices: ['Ci vediamo!'] }; } };
    if (active().length >= 3) return { line: fill(npcId, rnd(BUSY)), choices: ['Ci vediamo!', 'Che si dice?'], choose: () => null };
    const cd = S().giverCd[npcId] || 0;
    if (Date.now() < cd) return { line: fill(npcId, rnd(NOPE)), choices: ['Ci vediamo!', 'Che si dice?'], choose: () => null };
    const q = make(npcId); if (!q) return null;
    const line = await voice(npcId, q.line, q.desc);
    return { line, choices: ['Ci sto!', 'Magari dopo'], choose: t => {
      if (/^ci sto/i.test(t)) { accept(q); return { line: fill(npcId, rnd(['Daje! Ti aspetto.', 'Grande. Non farmi pentire.', '{cp}. Vai!', 'Bravo burdèl.'])) + (q.type === 'deliver' ? ` ${cap(q.item.name)}, tieni.` : ''), choices: ['Ci vediamo!'] }; }
      return { line: fill(npcId, rnd(['Va bene, come vuoi.', 'Sempre il solito. {cp}.', 'Ok, ma poi non lamentarti.'])), choices: ['Ci vediamo!', 'Che si dice?'] };
    } };
  }

  function accept(q) {
    delete q.line; S().quests.push(q); S().tracked = q.id;
    if (q.type === 'fetch') spawnFetch(q);
    if (q.type === 'deliver') { q.step = `Porta ${q.item.name} a ${q.data.toName}`; R.ensureNpc(q.data.to); }
    if (q.type === 'kill') q.step = `${q.desc} · ${q.have}/${q.need}`;
    R.save(); R.sfx('quest');
    R.ui.feedAdd('📜', q.title, 'Nuova missione · ' + nameOf(q.giver), q.color);
    emitEvent('quest', { text: `Zuck ha accettato una missione da ${nameOf(q.giver)}: ${q.desc}` });
  }
  function spawnFetch(q) {
    const d = FETCH[q.data.k], a = anchorPos(d.anchor); if (!a) return;
    const p = R.walkNear(a.x, a.z) || a;
    spawned.add(q.id); R.loot.spawnQuest(q.id, { x: p.x, y: 0.4, z: p.z }, { name: d.name, icon: d.icon });
    q.data.pos = [p.x, p.z];
  }
  function abandon(id) { const q = byId(id); if (!q) return; S().quests = active().filter(x => x !== q); R.loot.removeQuest(id); if (S().tracked === id) S().tracked = (active()[0] || {}).id || null; R.save(); }
  function complete(q, by) {
    if (!byId(q.id)) return;
    S().quests = active().filter(x => x !== q); R.loot.removeQuest(q.id);
    if (S().tracked === q.id) S().tracked = (active()[0] || {}).id || null;
    S().questsDone++; S().giverCd[q.giver] = Date.now() + 60000;
    R.addXP(q.reward.xp, 'quest'); R.addMoney(q.reward.euro, 'quest');
    if (q.reward.loot) R.giveLoot(q.type === 'legendary' ? 1.6 : q.type === 'kill' ? 1.0 : 0.7);
    R.ui.banner('Missione compiuta', q.title, `+${q.reward.xp} XP · € ${q.reward.euro}${q.reward.loot ? ' · bottino nello zaino' : ''}`);
    R.sfx('done'); R.save();
    R.unlock('quest_first', { title: 'Favore fatto', desc: 'Completa una missione per un amico', icon: '📜' });
    if (S().questsDone >= 10) R.unlock('quest_10', { title: 'Tuttofare del gruppo', desc: 'Completa 10 missioni', icon: '🧰' });
    if (S().questsDone >= 30) R.unlock('quest_30', { title: 'Il factotum di Teletubbylandia', desc: 'Completa 30 missioni', icon: '🏅' });
    emitEvent('quest', { text: `Zuck ha completato la missione di ${nameOf(q.giver)}: ${q.title}` });
  }
  function progress(q, n = 1) {
    q.have = Math.min(q.need, q.have + n);
    if (q.type === 'kill') q.step = `${q.desc} · ${q.have}/${q.need}`;
    if (q.have >= q.need) complete(q); else R.save();
  }

  // ---------------------------------------------------------------- hooks from the game
  function onKill(pos, playerZone) {
    for (const q of active().slice()) if (q.type === 'kill') {
      const z = R.zoneAt(pos.x, pos.z);
      if (z === q.target.zone || playerZone === q.target.zone) progress(q);
    }
  }
  function onMinigame(kind, text) {
    for (const q of active().slice()) if (q.type === 'minigame') { const g = GAMES[q.data.k]; if (g && g.kind === kind && g.win.test(text)) progress(q); }
  }
  function onLoot(item) {
    for (const q of active().slice()) if (q.type === 'legendary' && (RANK[item.rarity] || 0) >= q.data.min) progress(q);
  }
  function picked(qid) {
    const q = byId(qid); if (!q) return false;
    q.state = 'ready'; q.have = 1; q.need = 1; q.target = { npc: q.giver }; q.step = `Porta ${q.item.name} a ${nameOf(q.giver)}`;
    R.ensureNpc(q.giver); R.sfx('pick'); R.ui.feedAdd(q.item.icon, cap(q.item.name), 'Missione · torna da ' + nameOf(q.giver), q.color); R.save();
    return true;
  }
  const spawnT = { t: 0 }, spawned = new Set();
  function update(dt, player, mode) {
    // restore world quest items after a reload
    for (const q of active()) if (q.type === 'fetch' && q.state === 'active' && !spawned.has(q.id)) spawnFetch(q);
    if (!player) return;
    const pz = R.zoneAt(player.x, player.z);
    for (const q of active().slice()) {
      if (q.type === 'vespa' && mode === 'vespa') { const a = anchorPos(q.target.anchor); if (a && Math.hypot(a.x - player.x, a.z - player.z) < 7) progress(q); }
      if (q.type === 'kill' && pz === q.target.zone) { spawnT.t -= dt; if (spawnT.t <= 0) { spawnT.t = 3.5; R.spawnQuestEnemy(q, player); } }
      if ((q.type === 'deliver' || q.state === 'ready') && q.target.npc && !R.npcPos(q.target.npc)) {
        const h = anchorPos(HOME[q.target.npc]); if (h && Math.hypot(h.x - player.x, h.z - player.z) < 25) R.ensureNpc(q.target.npc, true);
      }
    }
  }
  // where the waypoint points + the tracker text
  function targetOf(q) {
    if (!q) return null;
    if (q.target.npc) { const p = R.npcPos(q.target.npc); if (p) return { x: p.x, z: p.z, y: 2.1 }; const h = anchorPos(HOME[q.target.npc]); return h ? { x: h.x, z: h.z, y: 1.6, hint: `${nameOf(q.target.npc)} non è in giro: chiamalo dal telefono` } : null; }
    if (q.type === 'fetch' && q.data.pos) return { x: q.data.pos[0], z: q.data.pos[1], y: 1.0 };
    if (q.target.anchor) { const a = anchorPos(q.target.anchor); if (!a) return null; if (q.type === 'kill' && R.zoneAt(R.playerPos().x, R.playerPos().z) === q.target.zone) return { inside: true }; return { x: a.x, z: a.z, y: 1.6 }; }
    return null;
  }
  const view = q => ({ ...q, giverName: nameOf(q.giver), color: q.color || QCOL[q.type] });
  return {
    offer, accept, abandon, complete, onKill, onMinigame, onLoot, picked, update, targetOf, view,
    list: () => active().map(view), track(id) { if (byId(id)) { S().tracked = id; R.save(); } },
    tracked: () => byId(S().tracked) || active()[0] || null,
  };
}
