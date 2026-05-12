export enum PredefinedDeckType {
  ORIGINAL = 'ORIGINAL',
  QUEST = 'QUEST',
  ODYSSEY = 'ODYSSEY',
}

//Helper para generar una secuencia de IDs simulados (los IDs de BD son numéricos y secuenciales)
function generateSequence(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const CARDS_PER_DECK = 84;

//Suponemos que cada colección tiene 84 cartas.
export const PREDEFINED_DECKS: Record<PredefinedDeckType, number[]> = {
  [PredefinedDeckType.ORIGINAL]: generateSequence(1, CARDS_PER_DECK),
  [PredefinedDeckType.QUEST]: generateSequence(
    CARDS_PER_DECK + 1,
    CARDS_PER_DECK * 2,
  ),
  [PredefinedDeckType.ODYSSEY]: generateSequence(
    CARDS_PER_DECK * 2 + 1,
    CARDS_PER_DECK * 3,
  ),
};

export const PREDEFINED_DECK_KEYS = Object.values(PredefinedDeckType);
