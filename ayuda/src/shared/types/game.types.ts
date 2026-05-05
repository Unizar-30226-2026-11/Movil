/**
 * Modos de juego disponibles en la aplicación.
 * STANDARD: Basado en las reglas clásicas de Dixit.
 * STELLA: Basado en las reglas del juego Stella (variante del universo Dixit).
 */
export type GameMode = 'STANDARD' | 'STELLA';

/**
 * Fases posibles del flujo de juego estándar (Dixit), agrupadas por lógica.
 * - STORYTELLING: El cuentacuentos elige una carta de su mano y da una pista.
 * - SUBMISSION: Los demás jugadores eligen una carta de su mano que coincida con la pista.
 * - VOTING: Los jugadores (excepto el cuentacuentos) votan por la carta que creen que es la original.
 * - SCORING: Resolución de la ronda y reparto de puntos.
 * - FINISHED: Partida terminada, se muestran los ganadores.
 */
export type StandardPhase =
  | 'STORYTELLING'
  | 'SUBMISSION'
  | 'VOTING'
  | 'SCORING'
  | 'FINISHED';

/**
 * Fases posibles del flujo de juego modo Stella.
 * - STELLA_WORD_REVEAL: Se revela la palabra clave de la ronda.
 * - STELLA_MARKING: Los jugadores seleccionan en secreto las cartas asociadas a la palabra.
 * - STELLA_REVEAL: Fase de turnos donde los jugadores van revelando sus marcas.
 * - SCORING: Resolución de la ronda y sumatoria de puntos temporales al global.
 * - FINISHED: Partida terminada al alcanzar la condición de victoria (ej. 30 puntos).
 */
export type StellaPhase =
  | 'STELLA_WORD_REVEAL'
  | 'STELLA_MARKING'
  | 'STELLA_REVEAL'
  | 'SCORING'
  | 'FINISHED';

/**
 * Representa el voto de un jugador en el modo estándar de Dixit.
 */
export interface Vote {
  /** ID del jugador que emite el voto */
  voterId: string;
  /** ID de la carta por la que está votando (la que cree que es del cuentacuentos) */
  targetCardId: number;
}

/**
 * Define un modificador temporal aplicado a un jugador (Ej: Bonus aleatorio de cartas).
 */
export interface ModifierData {
  /** Tipo de modificador (preparado para escalar a más tipos en el futuro) */
  type: 'HAND_LIMIT';
  /** Valor del modificador (Ej: +2 o -1 cartas permitidas en mano) */
  value: number;
  /** Turnos restantes antes de que el modificador desaparezca */
  turnsLeft: number;
}

// ==========================================
// ESTRUCTURAS DE RONDA
// ==========================================

/**
 * Almacena el estado transitorio exclusivo de una ronda en el modo STANDARD.
 */
export interface StandardRound {
  /** ID del jugador que actúa como cuentacuentos en esta ronda */
  storytellerId: string;
  /** Pista o frase proporcionada por el cuentacuentos */
  clue: string | null;
  /** ID de la carta real jugada por el cuentacuentos */
  storytellerCardId: number | null;
  /** Mapeo de cartas enviadas a la mesa. Clave: ID del Jugador, Valor: ID de la Carta */
  playedCards: Record<string, number>; // { ID_Jugador: ID_Carta }
  /** Lista de IDs de las cartas que se muestran en la mesa para ser votadas (barajadas) */
  boardCards: number[];
  /** Registro de todos los votos emitidos en la ronda actual */
  votes: Vote[];
}

/**
 * Almacena el estado transitorio exclusivo de una ronda en el modo STELLA.
 */
export interface StellaRound {
  /** La palabra clave común de la ronda sobre la que hay que hacer asociaciones */
  word: string | null;
  /** Cartas dispuestas en la mesa. Siempre son 15 cartas en Stella */
  boardCards: number[];
  /** Diccionario con las selecciones secretas de cada jugador. { ID_Jugador: [ID_Carta1, ID_Carta2...] } */
  playerMarks: Record<string, number[]>;
  /** Registro histórico de las cartas que ya han sido reveladas por los jugadores */
  revealedCards: number[];
  /** ID del jugador que tiene el turno actual para revelar una de sus marcas (Scout) */
  currentScoutId: string | null;
  /** Lista de IDs de jugadores que revelaron una marca sin coincidencias y se han "caído" en esta ronda */
  fallenPlayers: string[];

  /** ID del jugador que hizo estrictamente más marcas que los demás (penaliza si se cae) */
  inTheDarkPlayerId: string | null;
  /** Marcador temporal de los puntos obtenidos exclusivamente en esta ronda */
  roundScores: Record<string, number>;
  /** Contador de aciertos (chispas) acumulados en la ronda, usado para calcular penalizaciones */
  successfulMarks: Record<string, number>;
}

// ==========================================
// ESTADO DEL JUEGO (UNIÓN DISCRIMINADA)
// ==========================================

/**
 * Estructura base con las propiedades comunes a cualquier modo de juego.
 */
interface BaseGameState {
  /** Código único de la sala/lobby para invitar jugadores */
  lobbyCode: string;
  /** Estado general del ciclo de vida de la partida */
  status: 'playing' | 'finished';
  /** Lista de IDs de los jugadores presentes en la partida */
  players: string[];
  /** Lista de IDs de jugadores que han perdido la conexión */
  disconnectedPlayers: string[];
  /** Lista de IDs de los jugadores que han ganado (puede haber empates) */
  winners?: string[];
  /** Marcador global del juego. { ID_Jugador: Puntuación_Total } */
  scores: Record<string, number>;
  /** Cartas que cada jugador tiene en su mano privada. { ID_Jugador: [IDs_Cartas] } */
  hands: Record<string, number[]>;
  /** Mazo central del que se roban las cartas (contiene IDs de las cartas disponibles) */
  centralDeck: number[];
  /** Pila de descartes (cartas ya jugadas que se pueden reciclar si el mazo central se agota) */
  discardPile: number[];
  /** Registro de visitas a casillas especiales. { ID_Casilla: [IDs_Jugadores_En_Orden] } */
  boardRegistry: Record<number, string[]>;
  /** Indica si hay una estrella fugaz activa en pantalla */
  isStarActive: boolean;
  /** Timestamp en milisegundos de cuándo debe desaparecer la estrella */
  starExpiresAt: number;

  /** Indica si hay un minijuego de conflicto activo.
   *  Bloquea el procesamiento de acciones normales.
   */
  isMinigameActive: boolean;

  // Guardamos quiénes están peleando para saber si uno huye
  activeConflict?: { player1: string; player2: string; isDuel: boolean } | null;

  /**
   * Diccionario en memoria con las URLs de las cartas de la partida.
   * Evita saturar PostgreSQL con consultas constantes en cada acción.
   * { ID_Carta: 'url_de_la_imagen.png' }
   */
  cardUrls: Record<number, string>;
}

/**
 * Estado completo del juego cuando se encuentra en modo STANDARD.
 */
export interface StandardGameState extends BaseGameState {
  mode: 'STANDARD';
  phase: StandardPhase;
  currentRound: StandardRound;
}

/**
 * Estado completo del juego cuando se encuentra en modo STELLA.
 */
export interface StellaGameState extends BaseGameState {
  mode: 'STELLA';
  phase: StellaPhase;
  currentRound: StellaRound;
}

/**
 * El estado global que usará el motor. TypeScript inferirá el tipo de 'currentRound'
 * y 'phase' dependiendo del valor que tenga 'mode' gracias a ser una unión discriminada.
 */
export type GameState = StandardGameState | StellaGameState;

// ==========================================
// ACCIONES (UNIÓN DISCRIMINADA)
// ==========================================

// Acciones Globales (Aplicables a cualquier modo de juego)

/** Acción para inicializar la partida y establecer el mazo inicial */
export interface ActionInitGame {
  type: 'INIT_GAME';
  playerId: string;
  payload: { deck: number[] };
}
/** Acción registrada cuando un jugador pierde la conexión */
export interface ActionDisconnect {
  type: 'DISCONNECT_PLAYER';
  playerId: string;
}
/** Acción registrada cuando un jugador recupera la conexión */
export interface ActionReconnect {
  type: 'RECONNECT_PLAYER';
  playerId: string;
}
/** Acción registrada cuando un jugador es expulsado por inactividad */
export interface ActionKick {
  type: 'KICK_PLAYER';
  playerId: string;
}
/** Acción que fuerza el avance a la siguiente ronda (limpieza y preparación) */
export interface ActionNextRound {
  type: 'NEXT_ROUND';
  playerId: string;
}
/** Acción para cambiar el modo de juego en el lobby o antes de iniciar */
export interface ActionChangeMode {
  type: 'CHANGE_MODE';
  playerId: string;
  payload: { mode: GameMode };
}

/** Acción enviada por el jugador más rápido al clicar la estrella */
export interface ActionClaimStar {
  type: 'CLAIM_STAR';
  playerId: string;
}

/** Enviada cuando un jugador elige a su víctima para el duelo de dados */
export interface ActionResolveDuel {
  type: 'RESOLVE_DUEL';
  playerId: string;
  payload: { targetId: string };
}

// Acciones Standard (Exclusivas de las mecánicas Dixit clásico)

/** Acción enviada por el cuentacuentos con su carta seleccionada y la pista */
export interface ActionSendStory {
  type: 'SEND_STORY';
  playerId: string;
  payload: { cardId: number; clue: string };
}
/** Acción enviada por el resto de jugadores con la carta que quieren jugar */
export interface ActionSubmitCard {
  type: 'SUBMIT_CARD';
  playerId: string;
  payload: { cardId: number };
}
/** Acción enviada en la fase de votación para indicar qué carta creen que es la del cuentacuentos */
export interface ActionCastVote {
  type: 'CAST_VOTE';
  playerId: string;
  payload: { cardId: number };
}

// Acciones Stella (Exclusivas de las mecánicas del modo Stella)

/** Acción para enviar el listado oculto de cartas marcadas asociadas a la palabra */
export interface ActionStellaSubmitMarks {
  type: 'STELLA_SUBMIT_MARKS';
  playerId: string;
  payload: { cardIds: number[] };
}
/** Acción para revelar públicamente una carta de las previamente marcadas en el turno del jugador */
export interface ActionStellaRevealMark {
  type: 'STELLA_REVEAL_MARK';
  playerId: string;
  payload: { cardId: number };
}

/**
 * Unión de todas las acciones posibles en el juego.
 * Permite tipado estricto en los reducers o enrutadores de estado.
 */
export type GameAction =
  | ActionInitGame
  | ActionDisconnect
  | ActionReconnect
  | ActionKick
  | ActionNextRound
  | ActionChangeMode
  | ActionClaimStar
  | ActionResolveDuel
  | ActionSendStory
  | ActionSubmitCard
  | ActionCastVote
  | ActionStellaSubmitMarks
  | ActionStellaRevealMark;
