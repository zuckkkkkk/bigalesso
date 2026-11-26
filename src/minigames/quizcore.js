// "Chi l'ha detto?" core: rounds built from the filtered group quotes (assets/chat/quotes.json).
// 9 "who said it?" questions + a bonus "which one is fake?" (fake lines from the AI in the persona's style, or offline ones).
import { quotes, personas, persona, shuffle, pick, ask, SAFE, clean } from './shared.js';
import { FAKES as SHARED_FAKES } from '../../shared/quiz.mjs';

// offline fake lines (written for the game, in the group's tone; never real messages): shared with the online battle
const FAKES = SHARED_FAKES.map(([who, text]) => ({ who, text }));
export function rankOf(correct, n = 10) {
  const k = correct / n;
  return k >= 1 ? 'Membro certificato' : k >= 0.7 ? 'Teletubby DOC' : k >= 0.4 ? 'Utente medio del gruppo' : k >= 0.2 ? 'Appena entrato' : 'Zona demilitarizzata';
}
// returns [{ kind:'who', q, options:[ids], answer:id } x9, { kind:'fake', lines:[{who,text,fake}], answer:index }]
export function buildRounds(n = 10, used = new Set(), fake = null) {
  const Q = quotes(), P = personas();
  const byWho = {}; for (const q of Q) (byWho[q.who] = byWho[q.who] || []).push(q);
  const speakers = Object.keys(byWho);
  const rounds = [];
  const pool = shuffle(Q.filter(q => !used.has(q.text)));
  const perWho = {};
  for (const q of pool) {
    if (rounds.length >= n - 1) break;
    if ((perWho[q.who] || 0) >= 2) continue; // variety
    perWho[q.who] = (perWho[q.who] || 0) + 1; used.add(q.text);
    const others = shuffle(speakers.filter(s => s !== q.who)).slice(0, 3);
    while (others.length < 3) { const p = pick(P).id; if (p !== q.who && !others.includes(p)) others.push(p); }
    rounds.push({ kind: 'who', q, options: shuffle([q.who, ...others]), answer: q.who });
  }
  // bonus: 3 real lines + 1 fake
  const f = fake || pick(FAKES);
  const reals = shuffle(Q.filter(q => q.who !== f.who && !used.has(q.text))).slice(0, 3);
  const lines = shuffle([...reals.map(r => ({ ...r, fake: false })), { ...f, fake: true }]);
  rounds.push({ kind: 'fake', lines, answer: lines.findIndex(l => l.fake) });
  return rounds;
}
// AI fake line in a persona's style (falls back to the offline list)
export async function aiFake() {
  const P = personas().filter(p => (p.catchphrases || []).length);
  const p = pick(P);
  const off = () => pick(FAKES.filter(x => x.who === p.id).concat(FAKES));
  const sample = quotes().filter(q => q.who === p.id).slice(0, 6).map(q => '- ' + q.text).join('\n');
  const txt = await ask({
    model: 'fast', maxTokens: 60, persona: p.id,
    system: 'Generi UNA frase finta per un quiz tra amici: deve sembrare scritta in una chat di gruppo WhatsApp da questo personaggio, ma essere inventata e leggermente assurda. Massimo 12 parole, niente emoji, niente virgolette. ' + SAFE,
    prompt: `Personaggio: ${p.name} — ${p.tone}. Intercalari: ${(p.catchphrases || []).join(', ')}.\nEsempi di come scrive:\n${sample}\nScrivi solo la frase.`,
  }, null, 7000);
  if (!txt) return off();
  const t = clean(txt, 90).split('\n')[0];
  return t.length > 6 ? { who: p.id, text: t, ai: true } : off();
}
export { persona };
