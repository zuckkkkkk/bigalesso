// rp/data.js — roleplay data: jobs, ranks, lines, places, furniture catalogue. Pure data, no three.js.

export const RANKS = [
  { name: 'Stagista', xp: 0 }, { name: 'Apprendista', xp: 60 }, { name: 'Dipendente', xp: 180 },
  { name: 'Capo turno', xp: 400 }, { name: 'Titolare', xp: 800 },
];
export const rankOf = xp => { let i = 0; for (let k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) i = k; return i; };
export const nextRankXp = xp => { const i = rankOf(xp); return i < RANKS.length - 1 ? RANKS[i + 1].xp : null; };
export const payMul = rank => 1 + 0.15 * rank;

export const JOBS = {
  rider: {
    id: 'rider', name: 'Rider', icon: '🛵', color: '#28c2a0', tasks: 4, place: 'Sushi, Celtic o Piazzetta', title: 'Re dei rider',
    desc: 'Ritira gli ordini e portali a casa degli amici. Più sei veloce e più la roba arriva intera, più mance.',
    gear: 'rider',
  },
  barista: {
    id: 'barista', name: 'Barista al Celtic', icon: '🍺', color: '#e0a030', tasks: 6, place: 'Celtic, dietro al bancone', title: 'Spillatore folle',
    desc: 'Spina le birre ordinate dagli amici al bancone: livello giusto, schiuma giusta, prima che perdano la pazienza.',
    gear: 'barista',
  },
  buttafuori: {
    id: 'buttafuori', name: 'Buttafuori al Millennium', icon: '🕶️', color: '#9a7cff', tasks: 8, place: 'porta del Millennium', title: 'Il muro del Millennium',
    desc: 'Alla porta decidi chi entra: regole della serata, lista, dress code e chi ha già bevuto troppo.',
    gear: 'buttafuori',
  },
  vigile: {
    id: 'vigile', name: 'Vigile urbano', icon: '👮', color: '#e8e8e8', tasks: 3, place: 'strade del quartiere', title: 'Lo sceriffo di Petroni',
    desc: 'Trova le macchine parcheggiate da cani, scegli l\'infrazione giusta e reggi la discussione col proprietario.',
    gear: 'vigile',
  },
};
export const JOB_IDS = Object.keys(JOBS);

// friends that can show up as customers / owners (persona ids from assets/chat/personas.json)
export const CAST = ['asche', 'ashish', 'forla', 'seghino', 'ciccio', 'parme', 'lombu', 'cesco', 'ricky', 'jacopo', 'mirco'];

// ---------------------------------------------------------------- rider
export const PICKUPS = [
  { id: 'sushi', name: 'Sushi', anchor: 'sushi_door', food: ['un sushi misto da 40 pezzi', 'due uramaki fritti', 'edamame e gyoza'], icon: '🍣' },
  { id: 'celtic', name: 'Celtic', anchor: 'celtic_door', food: ['un hamburger doppio', 'patatine e alette', 'un fish and chips'], icon: '🍔' },
  { id: 'piadina', name: 'Piadineria della Piazzetta', anchor: 'piazzetta', food: ['due piadine crudo e squacquerone', 'una crescentina farcita', 'tigelle per quattro'], icon: '🥙' },
];
// where friends get their food: house doors (quartiere anchors house_<id>) or a spot where they hang out
export const DROPS = [
  { who: 'parme', anchor: 'house_parme', where: 'casa di Parme' }, { who: 'seghino', anchor: 'house_seghino', where: 'casa di Seghino' },
  { who: 'forla', anchor: 'house_forla', where: 'casa di Forla' }, { who: 'asche', anchor: 'house_asche', where: 'casa di Asche' },
  { who: 'ashish', anchor: 'house_ashish', where: 'casa di Ashish' }, { who: 'lombu', anchor: 'house_lombu', where: 'casa di Lombu' },
  { who: 'ciccio', anchor: 'millennium_door', where: 'Ciccio al Millennium' }, { who: 'cesco', anchor: 'edicola', where: 'Cesco all\'edicola' },
  { who: 'jacopo', anchor: 'teletubby', where: 'Jacopo a Teletubbylandia' }, { who: 'mirco', anchor: 'checkpoint', where: 'Mirco al checkpoint' },
  { who: 'ricky', anchor: 'petroni', where: 'Ricky in Via Petroni' },
];
export const RIDER_LINES = {
  fast: ['Madonna che velocità, sgravato', 'Già qui? Palese che sei il migliore', 'Ma sei arrivato in teletrasporto?', 'Rider dell\'anno, giuro'],
  ok: ['Ok grazie zio', 'Bella, metti pure lì', 'Era ora, ho una fame che non ci vedo', 'Grazie vecio'],
  late: ['Ma dov\'eri, a Ferrara?', 'È tutto freddo porca troia', 'Ci hai messo una vita, niente mancia', 'Una stella su cinque e ti va bene'],
  broken: ['Ma ci hai giocato a calcetto col mio sushi?', 'Sembra passato in lavatrice', 'Questa la recensisco, sappilo'],
};

// ---------------------------------------------------------------- barista
export const BEERS = [
  { id: 'bionda', name: 'Bionda', color: '#f2c14e', foam: [0.06, 0.12], settle: false },
  { id: 'rossa', name: 'Rossa', color: '#c2552a', foam: [0.07, 0.13], settle: false },
  { id: 'ipa', name: 'IPA', color: '#e8a030', foam: [0.05, 0.11], settle: false },
  { id: 'guinness', name: 'Guinness', color: '#1a120c', foam: [0.08, 0.14], settle: true }, // two-step pour: fill, let it settle, top up
];
export const SIZES = [{ id: 'piccola', name: 'piccola', k: 0.62 }, { id: 'media', name: 'media', k: 0.82 }, { id: 'pinta', name: 'pinta', k: 1 }];
export const BAR_LINES = {
  order: ['Oh barista, {b}', 'Mi fai {b}? Grazie bro', 'Per me {b}, e veloce che ho sete', '{b}, ma fatta bene eh', 'Dai che stasera si beve: {b}'],
  great: ['Perfetta. Sposami', 'Questa sì che è una birra', 'Ah, una spina fatta come si deve', 'Mancia meritata, tieni'],
  ok: ['Ok, ci sta', 'Bevibile', 'Va bene dai'],
  foam: ['Ma è tutta schiuma porca troia', 'Mi hai dato un cappuccino?', 'Questa è panna montata'],
  low: ['Mezza vuota? Il resto lo bevi tu?', 'Oh, fino all\'orlo grazie', 'Questa è una piccola travestita'],
  spill: ['Hai allagato il bancone, coglione', 'Che spreco, c\'è birra ovunque', 'Asciuga, cretino'],
  angry: ['Vabbè vado al bar di fronte', 'Ma quanto ci metti? Ciao', 'Servizio di merda, me ne vado'],
};

// ---------------------------------------------------------------- buttafuori
export const RULES = [
  { id: 'notuta', text: 'Niente tute', bad: p => p.outfit === 'tuta' },
  { id: 'nociabatte', text: 'Niente ciabatte', bad: p => p.shoes === 'ciabatte' },
  { id: 'nosneakers', text: 'Niente scarpe da ginnastica', bad: p => p.shoes === 'sneakers' },
  { id: 'lista', text: 'Solo chi è in lista', bad: p => !p.list },
  { id: 'nomarci', text: 'Niente ubriachi marci', bad: p => p.drunk === 2 },
  { id: 'sobri', text: 'Solo sobri o brilli', bad: p => p.drunk === 2 },
  { id: 'nobanned', text: 'Chi è stato buttato fuori stasera non rientra', bad: p => p.banned },
];
export const VIP = { id: 'virtus', text: 'Maglia della Virtus = entra sempre', good: p => p.outfit === 'maglia della Virtus' };
export const OUTFITS = ['camicia', 'elegante', 'tuta', 'felpa', 'maglia della Virtus', 'giacca di pelle'];
export const SHOES = ['scarpe belle', 'sneakers', 'ciabatte', 'stivaletti'];
export const DRUNK = ['sobrio', 'brillo', 'ubriaco marcio'];
export const DOOR_NOTES = [
  'Dice di conoscere il DJ', 'Ti mostra la tessera dell\'Esselunga come documento', 'Giura che è il compleanno di sua nonna',
  'Ha in mano un kebab', 'Canta l\'inno della Virtus', 'Chiede se c\'è il guardaroba', 'Dice che dopo paga lui da bere a tutti',
  'Ha gli occhiali da sole alle due di notte', 'Ti chiede dove si fuma', 'Dice "sono con quelli dentro"',
];
export const DOOR_LINES = {
  in: ['Grande bro, ci vediamo dentro', 'Sapevo che eri dei nostri', 'Palese', 'Sgravato, grazie'],
  out: ['Ma vaffanculo, va', 'Locale di merda comunque', 'Ti ricorderò, coglione', 'Mi hai rovinato la serata', 'Vado al Kinki, ciao'],
  bribe: ['Dai, ti allungo {e} euro e non ne parliamo più', 'Facciamo {e} euro e mi fai passare?', '{e} euro, ultima offerta'],
};

// ---------------------------------------------------------------- vigile
// badly parked car spots (x, z, ry) and the right infraction for each
export const BAD_SPOTS = [
  { x: 9.6, z: 25.4, ry: Math.PI / 2, where: 'sulle strisce davanti al cancello', infr: 'strisce' },
  { x: -6.5, z: 25.3, ry: -Math.PI / 2, where: 'in doppia fila davanti a casa di Seghino', infr: 'doppia' },
  { x: 45.4, z: 27.6, ry: 0.4, where: 'in mezzo alla Piazzetta', infr: 'pedonale' },
  { x: 44.0, z: 60.0, ry: 0.1, where: 'in Via Petroni, zona pedonale', infr: 'pedonale' },
  { x: 42.6, z: 21.8, ry: Math.PI / 2, where: 'davanti all\'edicola, sul marciapiede', infr: 'marciapiede' },
  { x: 14.2, z: 21.2, ry: Math.PI / 2, where: 'davanti al passo carrabile del giardino', infr: 'passo' },
  { x: 30.5, z: 25.6, ry: -Math.PI / 2, where: 'in doppia fila davanti ai portici', infr: 'doppia' },
  { x: -39.0, z: 23.5, ry: 0.2, where: 'davanti al checkpoint', infr: 'divieto' },
];
export const INFRACTIONS = {
  doppia: { name: 'Sosta in doppia fila', euro: 42 }, pedonale: { name: 'Sosta in zona pedonale', euro: 87 },
  marciapiede: { name: 'Sosta sul marciapiede', euro: 42 }, passo: { name: 'Sosta davanti a passo carrabile', euro: 87 },
  strisce: { name: 'Sosta sulle strisce pedonali', euro: 42 }, divieto: { name: 'Sosta in divieto (cartello ben visibile)', euro: 42 },
};
export const PLATES = () => 'BO ' + String(100 + Math.floor(Math.random() * 899)) + ' ' + 'ABCDEFGHJKLMNPRSTVZ'[Math.floor(Math.random() * 19)] + 'ABCDEFGHJKLMNPRSTVZ'[Math.floor(Math.random() * 19)];
export const FINE_LINES = {
  excuse: ['Ma ero via due minuti, giuro', 'C\'era la mamma che stava male', 'Ma dai, tutti parcheggiano qui', 'Stavo solo prendendo un caffè', 'Ma lo sai chi sono io? Sono amico di Zuck', 'Era per scaricare la spesa'],
  angry: ['Ma vaffanculo, vigile di merda', 'Con tutti i problemi che ci sono multate me?', 'Ti denuncio, giuro', 'Che coglione, ci vediamo stasera'],
  happy: ['Grande, sei un amico vero', 'Ti offro uno spritz, dai', 'Lo sapevo che eri dei nostri'],
  sconto: ['Vabbè dai, almeno metà', 'Ok, la prossima volta parcheggio meglio', 'Mezza multa, mezzo amico'],
};

// ---------------------------------------------------------------- casa: furniture catalogue
// model: assets/models/<model>.glb via quartiere/models.js loadOptional (real metres, front +Z, base y=0); else a procedural
// fallback. size: target height (m) when the model needs scaling (null = keep). r: collider radius.
export const FURNI = [
  { id: 'panchina', name: 'Panchina del parco', model: 'park_bench', price: 120, r: 0.7, icon: '🪑', fb: 'bench' },
  { id: 'bidoni', name: 'Bidoni della differenziata', model: 'street_bins', price: 60, r: 0.6, icon: '🗑️', fb: 'bins' },
  { id: 'bici', name: 'Bici da città', model: 'bicycle_parked', price: 150, r: 0.5, icon: '🚲', fb: 'bike' },
  { id: 'scrivania', name: 'Postazione gaming', model: 'gaming_desk', price: 450, r: 0.8, icon: '🖥️', fb: 'desk' },
  { id: 'consolle', name: 'Consolle da DJ', model: 'dj_booth', price: 900, r: 0.9, icon: '🎛️', fb: 'dj' },
  { id: 'spina', name: 'Spina della birra', model: 'beer_tap', price: 350, r: 0.4, icon: '🍺', fb: 'tap' },
  { id: 'siepe', name: 'Siepe', model: 'hedge_bush', price: 40, r: 0.6, icon: '🌿', fb: 'hedge' },
  { id: 'albero', name: 'Tiglio', model: 'tree_linden', price: 220, r: 0.5, icon: '🌳', fb: 'tree' },
  { id: 'lampione', name: 'Lampione (spento, è arredo)', model: 'street_lamp', price: 180, r: 0.3, icon: '🏮', fb: 'lamp' },
  { id: 'vespa', name: 'Vespa da salotto', model: 'vespa', price: 1200, r: 0.7, icon: '🛵', fb: 'vespa' },
  { id: 'salotto', name: 'Salotto completo', model: 'living_room_set', price: 1500, r: 1.3, icon: '🛋️', fb: 'sofa' },
  { id: 'tavolo', name: 'Tavolino da birra', model: null, price: 80, r: 0.5, icon: '🪵', fb: 'table' },
];
export const furni = id => FURNI.find(f => f.id === id) || null;
// zones of the player's house where furniture can go (world.js zone names)
export const HOUSE_ZONES = ['Giardino', 'Salotto', 'Sala giochi'];

export const ACH = [
  { id: 'rp_first', icon: '💼', title: 'Primo stipendio', desc: 'Finisci un turno di lavoro' },
  { id: 'rp_rider', icon: '🛵', title: 'Re dei rider', desc: 'Diventa titolare come rider' },
  { id: 'rp_barista', icon: '🍺', title: 'Spillatore folle', desc: 'Diventa titolare al Celtic' },
  { id: 'rp_buttafuori', icon: '🕶️', title: 'Il muro del Millennium', desc: 'Diventa titolare alla porta del Millennium' },
  { id: 'rp_vigile', icon: '👮', title: 'Lo sceriffo di Petroni', desc: 'Diventa titolare come vigile' },
  { id: 'rp_perfect', icon: '✨', title: 'Turno perfetto', desc: 'Finisci un turno senza errori' },
  { id: 'rp_guinness', icon: '🖤', title: 'Due tempi', desc: 'Spina una Guinness perfetta' },
  { id: 'rp_fedina', icon: '📁', title: 'Fedina sporca', desc: 'Finisci nella fedina penale (comica)' },
  { id: 'rp_house', icon: '🛋️', title: 'Arredatore', desc: 'Metti 5 mobili in casa' },
  { id: 'rp_all', icon: '🧰', title: 'Uomo di mille mestieri', desc: 'Fai un turno in tutti e quattro i lavori' },
].map(a => ({ ...a, cat: 'Roleplay' }));
