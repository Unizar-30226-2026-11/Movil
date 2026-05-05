import { LOBBY_MIN_PLAYERS } from '../../shared/constants';
import {
  ActionChangeMode,
  ActionDisconnect,
  ActionInitGame,
  ActionKick,
  ActionReconnect,
  GameAction,
  GameMode,
  GameState,
} from '../../shared/types';
import {
  GameModeStrategy,
  StandardStrategy,
  StellaStrategy,
} from '../strategy';

export class DixitEngine {
  /**
   * Registro de las estrategias disponibles.
   * Si en el futuro añades un modo nuevo, solo tienes que instanciarlo aquí.
   */
  private static strategies: Record<GameMode, GameModeStrategy> = {
    STANDARD: new StandardStrategy(),
    STELLA: new StellaStrategy(),
  };

  /**
   * Punto de entrada principal. Recibe el estado actual y una acción,
   * y devuelve el nuevo estado inmutable.
   */
  static transition(currentState: GameState, action: GameAction): GameState {
    // Clonación profunda para garantizar la inmutabilidad
    const state = structuredClone(currentState);

    // 1. Acciones de Inicialización y Configuración Global
    if (action.type === 'INIT_GAME') {
      return this.handleInitGame(state, action);
      // Se podría utilizar 'as any' temporalmente aquí porque el estado inicial puede venir vacío
    }

    if (action.type === 'CHANGE_MODE') {
      return this.handleChangeMode(state, action);
    }

    // 2. Gestión de Conexiones (Resiliencia)
    if (action.type === 'DISCONNECT_PLAYER') {
      this.handleDisconnect(state, action);
      // Tras actualizar la lista global, delegamos en la estrategia para que
      // evalúe si esta desconexión permite avanzar de fase.
      return this.strategies[state.mode].transition(state, action);
    }

    if (action.type === 'RECONNECT_PLAYER') {
      this.handleReconnect(state, action);
      // Igual que en la desconexión, la estrategia debe reevaluar la fase.
      return this.strategies[state.mode].transition(state, action);
    }

    if (action.type === 'KICK_PLAYER') {
      this.handleKick(state, action);
      return this.strategies[state.mode].transition(state, action);
    }

    // 3. Enrutamiento de Acciones de Juego (Delegación al Patrón Strategy)
    const activeStrategy = this.strategies[state.mode];
    if (!activeStrategy) {
      throw new Error(`Estrategia no implementada para el modo: ${state.mode}`);
    }

    return activeStrategy.transition(state, action);
  }

  // ==========================================
  // LÓGICA GLOBAL DEL MOTOR
  // ==========================================

  /**
   * Inicializa la partida, el mazo global, y arranca el primer modo de juego.
   */
  private static handleInitGame(
    state: Partial<GameState>,
    action: ActionInitGame,
  ): GameState {
    const allCardIds: number[] = action.payload.deck;
    const players = state.players || []; // Asumimos que los jugadores ya están en el lobby

    if (players.length < LOBBY_MIN_PLAYERS) {
      throw new Error(
        `Se requieren al menos ${LOBBY_MIN_PLAYERS} jugadores para iniciar.`,
      );
    }
    if (!allCardIds || allCardIds.length < players.length * 6) {
      throw new Error('Mazo insuficiente para la cantidad de jugadores.');
    }

    // Barajado inicial del mazo (Fisher-Yates)
    const deck = [...allCardIds];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Configuración base compartida por todos los modos
    state.status = 'playing';
    state.centralDeck = deck;
    state.discardPile = [];
    state.disconnectedPlayers = [];
    state.scores = {};
    state.hands = {};

    // Reparto inicial de manos y puntuaciones
    for (let i = 0; i < players.length; i++) {
      const pId = players[i];
      state.scores[pId] = 0;
      state.hands[pId] = state.centralDeck.splice(-6);
    }

    state.mode = state.mode || 'STANDARD';

    // Delegamos la creación de la `currentRound` a la estrategia inicial
    const readyState = state as GameState;
    console.log('Estado listo para iniciar ronda:', readyState);
    console.log('Estrategia:', this.strategies[state.mode]);
    return this.strategies[state.mode].handleNextRound(readyState);
  }

  /**
   * Cambia el modo de juego "en caliente" conservando puntos, manos y jugadores.
   */
  private static handleChangeMode(
    state: GameState,
    action: ActionChangeMode,
  ): GameState {
    // Solo se puede cambiar de modo si la ronda ha terminado
    if (state.phase !== 'SCORING' && state.phase !== 'FINISHED') {
      throw new Error(
        'Solo puedes cambiar de modo al finalizar una ronda (fase SCORING).',
      );
    }

    const newMode = action.payload.mode;
    if (state.mode === newMode) {
      return state; // No hay cambio real
    }

    // Opcional: Mover las cartas de la mesa actual a la pila de descartes antes de cambiar
    // Esto asegura que la mesa quede limpia para el nuevo modo.
    if (state.currentRound && state.currentRound.boardCards) {
      state.discardPile.push(...state.currentRound.boardCards);
    }

    state.mode = newMode;

    // Arrancamos la primera ronda del nuevo modo
    return this.strategies[state.mode].handleNextRound(state);
  }

  /**
   * Añade al jugador a la lista de desconectados.
   */
  private static handleDisconnect(
    state: GameState,
    action: ActionDisconnect,
  ): void {
    if (!state.disconnectedPlayers.includes(action.playerId)) {
      state.disconnectedPlayers.push(action.playerId);
    }
  }

  /**
   * Recupera al jugador de la lista de desconectados.
   */
  private static handleReconnect(
    state: GameState,
    action: ActionReconnect,
  ): void {
    state.disconnectedPlayers = state.disconnectedPlayers.filter(
      (id) => id !== action.playerId,
    );
  }

  /**
   * Elimina completamente a un jugador por inactividad.
   */
  private static handleKick(state: GameState, action: ActionKick): void {
    const { playerId } = action;

    // Lo quitamos de la lista de jugadores activos
    state.players = state.players.filter((id) => id !== playerId);

    // Lo quitamos de la lista de desconectados si estaba
    state.disconnectedPlayers = state.disconnectedPlayers.filter(
      (id) => id !== playerId,
    );

    // Opcional: Podríamos tirar sus cartas al descarte, pero para evitar
    // mutar excesivamente y romper jugadas, solo borramos su mano
    if (state.hands[playerId]) {
      state.discardPile.push(...state.hands[playerId]);
      delete state.hands[playerId];
    }

    // Eliminamos sus puntos
    delete state.scores[playerId];
  }
}
