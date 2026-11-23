// interact/lines.js — offline reaction lines for emotes and friend actions (friends' banter, salty on purpose:
// the group talks like this). No slurs, no blasphemy, nothing about real people outside the joke.
export const rnd = a => a[(Math.random() * a.length) | 0];

export const EMOTE_REACT = {
  wave: ['Ue Zuck!', 'Bella zio', 'Ciao bello, che cazzo saluti che ci siamo visti ieri', 'Oh, ciao eh', 'Bella raga'],
  dance: ['Ma che cazzo balli', 'Oddio Zuck, fermati ti prego', 'Daje che parte la serata!', 'Sembri mio zio al matrimonio', 'Questo va su Instagram, sappilo'],
  medio: ['Ma vaffanculo tu!', 'Anche a te, coglione', 'Ah sì? Te lo infilo dove dico io', 'Ma che maleducato, porca troia', 'Simpatico come un calcio nei coglioni', 'Te lo rendo con gli interessi, stronzo'],
  facepalm: ['Eh, la vita è dura', 'Che figura di merda eh', 'Cosa hai combinato stavolta?', 'Lo sapevo, cazzo'],
  clap: ['Grazie grazie', 'Bravo, bravo, adesso paga da bere', 'Applausi per cosa esattamente?', 'Ma che cazzo applaudi'],
  yawn: ['Vai a letto vecchio', 'Già stanco? Sono le dieci', 'Ma sei morto dentro?', 'Svegliaaa'],
  pushup: ['Ma chi ti credi di essere, Rocky?', 'Una, due… basta, sei finito', 'Palestra domani? Sì, come no', 'Guarda che le ragazze non ti guardano lo stesso', 'Fai schifo ma con impegno'],
  selfie: ['Oh aspetta che mi metto in posa!', 'Mandamela nel gruppo eh', 'Vengo male, rifalla', 'Che cazzo di faccia hai fatto'],
};

export const ACTION_LINES = {
  beerOffer: ['Eh, finalmente una cosa intelligente', 'Offri tu? Allora sì cazzo', 'Birra? Ma certo zio', 'Prendo la doppio malto, tanto paghi tu'],
  beerCheers: ['Cin cin, alla salute!', 'Sláinte, coglione', 'Alla nostra, che siamo belli', 'Prosit! E un rutto per la patria'],
  fiveOk: ['Bella!', 'Gimme five, fratello', 'Ahia cazzo, piano!', 'Questa sì che è amicizia'],
  fiveMiss: ['Mancato, ahahah', 'Che figura di merda', 'Hai la mira di un cieco'],
  armIntro: ['Braccio di ferro? Ti spacco', 'Preparati a piangere', 'Ok, ma se perdi paghi il giro'],
  armWin: ['Ma come cazzo hai fatto?', 'Dopato. Sei dopato.', 'Ho il braccio stanco, rivincita!', 'Va bene, va bene, hai vinto, stronzo'],
  armLose: ['Torna in palestra, mollaccione', 'Hai il braccio di un grissino', 'Troppo facile, porca troia', 'Paghi tu, come da accordi'],
  insultBack: ['Senti chi parla, faccia da culo', 'Vaffanculo, ma con affetto', 'Ripetilo se hai il coraggio', 'Detto da te è un complimento', 'Ma vai a cagare va', 'Sei proprio un coglione, ma ti voglio bene'],
  selfie: ['Faccia da influencer!', 'Mandala nel gruppo subito', 'Vengo sempre di merda nelle foto'],
  follow: ['Ok, ti seguo, ma dove cazzo andiamo?', 'Vengo, vengo', 'Guido io la prossima volta', 'Va bene capo'],
  stop: ['Ok mi fermo qui', 'Grazie del giro, eh', 'Mi hai fatto camminare per niente'],
  celtic: ['Celtic? Ma certo, finalmente!', 'Andiamo che ho sete', 'Pinta e freccette, si va'],
};

// in persona: a light AI prompt, used only sometimes (the offline lines are the default)
export function reactPrompt(what) {
  return `Zuck (il padrone di casa) ti ha appena fatto: ${what}. Rispondi con UNA battuta brevissima (max 12 parole), parlata, da amico che ti sfotte, ` +
    'puoi dire parolacce leggere (cazzo, vaffanculo, coglione, stronzo) ma niente bestemmie, niente insulti su origine/religione/orientamento/disabilità.';
}
