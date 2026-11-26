// Mazzo da 40 carte italiane (bolognesi/piacentine): denari, coppe, spade, bastoni; 1-7 + fante (8), cavallo (9), re (10).
// Una carta è un intero 0..39: seme = floor(c / 10), valore = c % 10 + 1. Usato da briscola.mjs e scopa.mjs.
export const SUITS = ['denari', 'coppe', 'spade', 'bastoni'];
export const SUIT_SHORT = ['D', 'C', 'S', 'B'];
export const RANK_NAMES = { 1: 'Asso', 2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette', 8: 'Fante', 9: 'Cavallo', 10: 'Re' };
export const suitOf = c => Math.floor(c / 10);
export const rankOf = c => (c % 10) + 1;
export const card = (suit, rank) => suit * 10 + (rank - 1);
export const cardName = c => `${RANK_NAMES[rankOf(c)]} di ${SUITS[suitOf(c)]}`;
export const isCard = c => Number.isInteger(c) && c >= 0 && c < 40;
export function newDeck(r) { const d = []; for (let i = 0; i < 40; i++) d.push(i); return r ? r.shuffle(d) : d; }
// next player in turn order (counter-clockwise like at the table; for us just +1)
export const nextP = (p, n) => (p + 1) % n;
export const teamOf = (p, n) => (n === 4 ? p % 2 : p);
export const clone = o => JSON.parse(JSON.stringify(o));
