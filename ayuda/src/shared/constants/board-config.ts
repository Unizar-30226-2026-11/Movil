export const BOARD_CONFIG = {
  MAX_SCORE: 42, // Longitud total del tablero
  CHECKPOINT_65: 27, // Casilla de equilibrio

  SPECIAL_SQUARES: {
    // Fase Inicial: Creamos desigualdades
    ODD_SQUARE_1: 5, // Impares
    EVEN_SQUARE_1: 7, // Pares

    ODD_SQUARE_2: 9, // Impares
    EVEN_SQUARE_2: 11, // Pares

    // Fase Primera Mitad:
    BONUS_RANDOM_1: 15,
    SHUFFLE_1: 18,
    BONUS_RANDOM_2: 21,

    BET_DUEL_1: 25,

    // CASILLA EQUILIBRIO

    // Fase Segunda Mitad

    BONUS_RANDOM_3: 31,
    SHUFFLE_2: 34,
    BONUS_RANDOM_4: 37,

    BET_DUEL_2: 40,
  },
};

/*

Casilla de Equilibrio: avanza un punto por puesto actual en la partida. 

Casillas Especiales:

    Casilla de impares:  1º +1, 2º -1, 3º +2, 4º -2... (1º, 2º... en pasar solo teniendo en cuenta la primera vez de cada uno)

    Casilla de pares:   1º -1, 2º +1, 3º -2, 4º +2...

    Casilla de duelo: Se reta a un jugador  apostando 2 puntos cada uno.

    Casilla Bonus Aleatorio: +-(1-3) cartas en las proximas 2 rondas (Normal). Puntos en stella

    Casilla Shuffle: Cambia todas tus cartas por unas nuevas (Normal). Cambia tu puntuacion con otro al azar(Stella)

*/
