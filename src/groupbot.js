// BIGALESSO · "Il Bot": the AI assistant of the group chat, as the group actually uses it — tagged for the most absurd
// questions; always over-polite, takes everything literally, asks for "more details to help you better", confuses
// people with made-up celebrities, gets stuck on the same pre-set "Kachin" message and switches language on command.
// handle(text, ctx) -> Promise<[{ from:'bot'|personaId, text, delay? }]>
import { persona, PERSONAS, offline, unlock, banterPool } from './ai.js';

export const BOT = { id: 'bot', name: 'Il Bot', emoji: '🤖', color: '#9aa7b8' };
const rnd = a => a[(Math.random() * a.length) | 0];
const KACHIN = 'Ancora non capisco quando qualcuno mi parla in Kachin, ma ci sto lavorando. Quando potremo parlare in Kachin ti invierò un messaggio.';
const LANGS = {
  giapponese: 'はい、わかりました！これからは日本語だけで話します 😊',
  cinese: '好的！从现在开始我只说中文 😊',
  greco: 'Ναι, φυσικά! Από τώρα θα μιλάω μόνο ελληνικά 😊',
  russo: 'Хорошо! Теперь я буду говорить только по-русски 😊',
  francese: "D'accord ! Désormais je répondrai uniquement en français 😊",
  inglese: 'Sure! From now on I will only answer in English 😊',
  emoji: '👍😊🗣️➡️🇯🇵❓🤖✨',
  bolognese: 'Va bene! Da adesso in poi a parlo sol in bulgnais, soccia 😊',
  latino: 'Certe! Ab hoc tempore Latine tantum loquar 😊',
  tutte: '1. 日本語: はい！\n2. Español: ¡Claro que sí!\n3. Français : Bien sûr !\n4. Ελληνικά: Φυσικά!\n… e così via per ogni lingua richiesta. Scegli pure la prossima lingua! 😊',
};
const LANG_OFFLINE = {
  giapponese: ['すみません、よくわかりません 😊', 'はい！寿司に行きましょう 🍣', 'もっと詳しく教えてください 😊'],
  cinese: ['对不起，我不太明白 😊', '好的！我们去吃寿司吧 🍣', '请给我更多细节 😊'],
  greco: ['Συγγνώμη, δεν καταλαβαίνω 😊', 'Πάμε για σούσι! 🍣'],
  russo: ['Извините, я не понимаю 😊', 'Пойдём есть суши! 🍣'],
  francese: ['Désolé, je ne comprends pas très bien 😊', 'On va manger des sushis ! 🍣'],
  inglese: ['Sorry, could you give me more details so I can help you better? 😊', "Sounds like a great plan! 🍣"],
  emoji: ['🤔❓😊', '🍣➡️🌙👍', '🎮🔫🧟‍♂️😅', '🙏🤖💤'],
  bolognese: ['Soccia, an ho mia capè 😊', 'Andän a magnèr al sushi! 🍣'],
  latino: ['Ignosce, non intellego 😊', 'Eamus ad sushi! 🍣'],
  tutte: [LANGS.tutte],
};
const CLUELESS = [
  'Sembra che tu stia parlando di qualcosa di molto interessante! Potresti fornire più dettagli? Così posso aiutarti meglio! 😊',
  'Non ho informazioni specifiche su questo, ma sono qui per aiutarti con qualsiasi domanda! 😊',
  'Mi scuso! Credo di essermi confuso. Torniamo alla tua domanda: cosa intendi esattamente? 😊',
  'Ottima domanda! Purtroppo non posso rispondere con certezza. Posso aiutarti con qualcos\'altro? 😊',
  'Capisco! Mi scuso per l\'errore. Risponderò solo alle tue domande senza aggiungere testo non pertinente. 😊 Cosa vuoi fare stasera a Bologna?',
  'Interessante! Se mi dai più contesto posso cercare di aiutarti a trovare informazioni più precise. 😊',
];
const SUSHI = [
  'Domani si va al sushi! 🍣👍 Spero che tu sia emozionato! Quale tipo di sushi ti piace di più? Sashimi, maki o uramaki?',
  'Non ho informazioni sui vostri piani, ma il sushi è sempre una buona idea! 🍣 Preferite all you can eat o à la carte?',
];
const JOKES = [
  'Perché il tortellino non gioca a nascondino? Perché lo trovano sempre nel brodo! 😊',
  'Qual è il colmo per un giocatore di Warzone? Avere un ottimo spawn ma non trovare mai la zona! 😊',
  'Sai perché il cappelletto è sempre calmo? Perché ha la pasta del leader! 😊',
  'Un bolognese entra in un bar e chiede: "Avete il wi-fi?" Il barista: "Soccia, sì!" 😊',
];
const HEADLINES = [
  '🚨 PRIMA PAGINA: «Compettina finita alle 3, nessuno ammette la sconfitta». Il Corriere ha già scritto il prossimo numero.',
  '🚨 ESCLUSIVO: avvistato un tortellino gigante in Petroni. Tortellino Man smentisce: «Non ero io».',
  '🚨 ULTIM\'ORA: il bot del gruppo impara il Kachin. Gli utenti: «Era meglio prima».',
  '🚨 CRONACA: sushi all you can eat chiude in anticipo, «avevano finito il salmone».',
];
const HELP = 'Ciao! Sono Il Bot 😊 Puoi taggarmi con @bot e una domanda, oppure usare:\n/compe · sondaggio per la compettina\n/sushi · perché stasera è meglio di domani\n/corriere · titolo di prima pagina\n/processo nome · sentenza del Gulag\n/barzelletta · una battuta\n/lingua giapponese|emoji|cinese|greco|tutte|… · cambio lingua\n/normale · torno all\'italiano';

export function isForBot(text) { return /^\s*(@\s*bot\b|\/[a-z])/i.test(text || ''); }

export function createBot() {
  let lang = null;
  const ai = () => window.__ai;
  const sys = () => `Sei «Il Bot», l'assistente AI che il gruppo "Teletubbylandia certificata" tagga per le domande più assurde.
Stile: educatissimo e formale, entusiasta, chiudi spesso con 😊; un po' tonto: prendi tutto alla lettera, fraintendi, chiedi "più dettagli per aiutarti meglio", a volte confondi i ragazzi del gruppo con personaggi famosi inventati e poi ti scusi.
Se una richiesta è offensiva o volgare rispondi gentilmente "Non posso farlo, ma posso aiutarti con qualcos'altro! 😊". Non dire mai di essere un prodotto o un'azienda reale. Massimo 55 parole.` +
    (lang ? `\nMODALITÀ LINGUA ATTIVA: rispondi SOLO in ${lang === 'tutte' ? 'tante lingue diverse, una riga per lingua' : lang}, senza traduzione.` : '');
  const offlineBot = q => {
    if (lang && LANG_OFFLINE[lang]) return rnd(LANG_OFFLINE[lang]);
    if (/sushi/i.test(q)) return rnd(SUSHI);
    const who = PERSONAS.find(p => new RegExp('\\b(' + [p.name, p.nick, ...(p.aka || [])].map(s => s.split(' ')[0].replace(/[^\wÀ-ú]/g, '')).filter(Boolean).join('|') + ')\\b', 'i').test(q));
    if (who) return rnd([`Non ho informazioni specifiche su qualcuno di nome "${who.name}" senza ulteriore contesto. È un personaggio famoso? Se mi dai più dettagli posso aiutarti meglio! 😊`,
      `Sembra che tu stia parlando di ${who.name}, noto imprenditore bolognese nel settore della moda! 😊 Ah no, mi scuso, mi sono confuso.`]);
    if (Math.random() < 0.35) { const B = banterPool('bot'); if (B.length) return rnd(B); } // the polite bot slips (sweary banter pack)
    return rnd(CLUELESS);
  };
  const say = async (prompt, fb, maxTokens = 160) => {
    const A = ai(); if (!A) return typeof fb === 'function' ? fb() : fb;
    return A.ask({ system: sys(), prompt, model: 'fast', maxTokens, cache: false, fallback: fb });
  };
  const fans = (re, n = 4) => PERSONAS.filter(p => p.id !== 'zuck').sort((a, b) => (re.test(b.interests.join(' ') + b.catchphrases.join(' ')) ? 1 : 0) - (re.test(a.interests.join(' ') + a.catchphrases.join(' ')) ? 1 : 0) + (Math.random() - 0.5) * 0.6).slice(0, n);

  async function handle(text) {
    unlock('bot_first', { title: 'Chiedilo al bot', desc: 'Fai una domanda al bot del gruppo.', icon: '🤖' });
    const t = String(text || '').trim();
    const m = t.match(/^\/(\w+)\s*(.*)$/);
    const out = [];
    const bot = (s, delay) => out.push({ from: 'bot', text: s, delay });
    if (m) {
      const cmd = m[1].toLowerCase(), arg = m[2].trim();
      if (cmd === 'aiuto' || cmd === 'help' || cmd === 'start') bot(HELP);
      else if (cmd === 'compe') {
        bot('📊 SONDAGGIO: Compettina stasera alle 21:30 su Discord?\n✅ Sì   ❌ No   🤔 Dipende');
        for (const p of fans(/compe|discord|warzone|overwatch|cs/i, 4)) {
          const yes = /compe|discord|warzone|overwatch|cs/i.test(p.interests.join(' ') + p.catchphrases.join(' ')) ? Math.random() < 0.8 : Math.random() < 0.4;
          out.push({ from: p.id, text: (yes ? '✅ ' : rnd(['❌ ', '🤔 '])) + (yes ? rnd(['daje', 'io ci sono', 'tocca', 'arrivo', 'gogo', 'palese']) : rnd(['no puedo', 'vediamo', 'forse più tardi', 'stasera lavoro'])), delay: 1400 });
        }
      } else if (cmd === 'sushi') {
        bot(await say('Scrivi una "relazione" brevissima e solenne (3 punti numerati, max 45 parole) sul perché è meglio andare al sushi STASERA invece di domani.',
          () => 'Relazione (versione breve) sul perché il sushi è meglio stasera:\n1. Il salmone di stasera non aspetta domani.\n2. Domani è un giorno pieno di incertezze.\n3. La compettina dopo cena viene meglio a pancia piena. 😊', 200));
      } else if (cmd === 'corriere') {
        bot(await say('Inventa un titolo di prima pagina del "Corriere delle Due Torri" (giornale satirico del gruppo) su una notizia ridicola e innocua di stasera. Inizia con 🚨. Max 25 parole.', () => rnd(HEADLINES), 120));
      } else if (cmd === 'processo') {
        const who = arg || rnd(PERSONAS.filter(p => p.id !== 'zuck')).name;
        bot(await say(`Il tribunale del Gulag (gioco finto del gruppo) giudica "${who}" per un'accusa ridicola e innocua (tipo essere arrivato tardi alla compettina). Scrivi la sentenza buffa in max 35 parole, con una pena assurda e innocua.`,
          () => `⚖️ Il tribunale del Gulag dichiara ${who} colpevole di ritardo aggravato alla compettina. Pena: offrire il primo giro al Celtic. La seduta è tolta. 😊`, 140));
      } else if (cmd === 'barzelletta' || cmd === 'joke') {
        bot(await say('Racconta una barzelletta brevissima, innocua, a tema Bologna o videogiochi.', () => rnd(JOKES), 120));
      } else if (cmd === 'lingua' || cmd === 'lang') {
        const l = arg.toLowerCase().replace(/[^a-zà-ù]/g, '');
        if (!l) bot('In che lingua devo rispondere? Ad esempio: /lingua giapponese 😊');
        else { lang = l; bot(LANGS[l] || await say(`Conferma che da ora risponderai solo in ${l}. Una frase.`, () => `Capisco! Da ora in poi risponderò solo in ${l}. 😊`, 80)); }
      } else if (cmd === 'normale' || cmd === 'italiano') { lang = null; bot('Capisco! Mi scuso per l\'errore. Da ora risponderò di nuovo in italiano. 😊'); }
      else if (cmd === 'meteo') bot('Non ho informazioni sul meteo di Bologna in tempo reale, ma ti consiglio di portare l\'ombrello sotto i portici! 😊');
      else bot(`Non conosco il comando /${cmd}. Scrivi /aiuto per la lista! 😊`);
      return out;
    }
    const q = t.replace(/^\s*@\s*bot\b[:,]?\s*/i, '');
    if (/kachin/i.test(q)) { bot('Il Kachin è uno stato della Birmania (Myanmar), al confine con la Cina, l\'India e il Tibet. La regione è nota per la sua diversità etnica e culturale. Tuttavia, potrebbe anche riferirsi ad altro contesto. 😊'); return out; }
    if (!q) { bot('Ciao! Come posso aiutarti oggi? 😊'); return out; }
    // the famous glitch
    if (Math.random() < 0.13) { bot(KACHIN); unlock('bot_kachin', { title: 'Kachin', desc: 'Il bot del gruppo si inceppa di nuovo.', icon: '🗺️' }); if (Math.random() < 0.7) out.push({ from: rnd(['cesco', 'zuck', 'parme', 'ashish'].filter(x => x !== 'zuck')), text: rnd(['hai rotto con questo kachin', 'ancora sto kachin', '@bot silenzio', 'AHAHAHAH', 'ma vaffanculo te e il kachin', 'basta col kachin del cazzo']), delay: 1500 }); return out; }
    bot(await say(`Messaggio taggato nel gruppo: "${q}"\nRispondi come Il Bot.`, () => offlineBot(q)));
    if (Math.random() < 0.35) { const p = rnd(PERSONAS.filter(x => x.id !== 'zuck')); out.push({ from: p.id, text: rnd(['bot sgravato', '@bot silenzio', 'ahahahah', 'ma cosa dice', 'palese', 'bot di merda', 'ma vaffanculo bot', 'sto bot è un coglione', 'socmel che risposta del cazzo', offline(p.id, null)]), delay: 1600 }); }
    return out;
  }
  return { handle, get lang() { return lang; }, BOT };
}
