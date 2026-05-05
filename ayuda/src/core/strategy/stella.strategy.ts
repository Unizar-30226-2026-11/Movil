import {
  ActionStellaRevealMark,
  ActionStellaSubmitMarks,
  GameAction,
  GameState,
  StellaGameState,
} from '../../shared/types';
import { GameModeStrategy } from './core.strategy';

export class StellaStrategy implements GameModeStrategy {
  /**
   * Enrutador principal de las acciones del modo Stella.
   * Recibe el estado actual y la acción, y delega a la función correspondiente
   * para calcular y devolver el nuevo estado.
   * * @param state Estado actual del juego
   * @param action Acción disparada por un jugador o el sistema
   * @returns El nuevo estado del juego actualizado
   */
  public transition(state: GameState, action: GameAction): GameState {
    const stellaState = state as StellaGameState;

    switch (action.type) {
      case 'STELLA_SUBMIT_MARKS':
        return this.handleMarks(stellaState, action);
      case 'STELLA_REVEAL_MARK':
        return this.handleReveal(stellaState, action);
      case 'NEXT_ROUND':
        return this.handleNextRound(stellaState);

      case 'DISCONNECT_PLAYER':
      case 'RECONNECT_PLAYER':
      case 'KICK_PLAYER':
        // Si un jugador se conecta o desconecta, evaluamos si la fase debe avanzar
        // (por ejemplo, si estábamos esperando a ese único jugador para continuar).
        this.checkPhaseAdvancement(stellaState);
        return stellaState;

      default:
        throw new Error(`Acción ${action.type} no soportada en modo STELLA.`);
    }
  }

  // ==========================================
  // LÓGICA DE FASES DE STELLA
  // ==========================================

  /**
   * Gestiona la fase de marcado donde los jugadores seleccionan en secreto
   * qué cartas asocian con la palabra de la ronda.
   */
  private handleMarks(
    state: StellaGameState,
    action: ActionStellaSubmitMarks,
  ): GameState {
    // Validar que el jugador no esté desconectado
    this.validatePlayerActive(state, action.playerId);

    // Validaciones de fase y estado del jugador
    if (state.phase !== 'STELLA_MARKING') {
      throw new Error('No es el momento de marcar cartas.');
    }
    if (state.currentRound.playerMarks[action.playerId]) {
      throw new Error('Ya has enviado tus marcas.');
    }

    // Validaciones de la cantidad de marcas permitidas
    const marks = action.payload.cardIds;
    if (marks.length < 1 || marks.length > 10) {
      throw new Error('Debes marcar entre 1 y 10 cartas.');
    }

    // Comprobar que todas las cartas marcadas existen actualmente en la mesa
    const invalidMarks = marks.filter(
      (id) => !state.currentRound.boardCards.includes(id),
    );
    if (invalidMarks.length > 0) {
      throw new Error('Has marcado cartas que no están en la mesa.');
    }

    // Guardar las marcas del jugador
    state.currentRound.playerMarks[action.playerId] = marks;

    // Verificar si todos han marcado para avanzar de fase
    this.checkPhaseAdvancement(state);
    return state;
  }

  /**
   * Gestiona la fase de revelación donde el jugador activo (Scout) revela
   * una de sus cartas marcadas para comprobar coincidencias con otros jugadores.
   */
  private handleReveal(
    state: StellaGameState,
    action: ActionStellaRevealMark,
  ): GameState {
    this.validatePlayerActive(state, action.playerId);

    // Validaciones de turno y estado
    if (state.phase !== 'STELLA_REVEAL') {
      throw new Error('No es la fase de revelación.');
    }
    if (state.currentRound.currentScoutId !== action.playerId) {
      throw new Error('No es tu turno de revelar.');
    }
    if (state.currentRound.fallenPlayers.includes(action.playerId)) {
      throw new Error('Te has caído, no puedes revelar más cartas.');
    }

    const cardId = action.payload.cardId;
    const playerMarks = state.currentRound.playerMarks[action.playerId];

    // Validar la jugada
    if (!playerMarks.includes(cardId)) {
      throw new Error('No puedes revelar una carta que no marcaste.');
    }
    if (state.currentRound.revealedCards.includes(cardId)) {
      throw new Error('Esta carta ya fue revelada.');
    }

    // Añadir la carta al pool de cartas reveladas en la ronda
    state.currentRound.revealedCards.push(cardId);

    // Comprobar coincidencias con TODOS los demás jugadores (activos y caídos)
    const otherPlayers = state.players.filter((p) => p !== action.playerId);
    const matches = otherPlayers.filter((pId) =>
      state.currentRound.playerMarks[pId]?.includes(cardId),
    );

    if (matches.length === 0) {
      // CAÍDA: Nadie más marcó la carta. El jugador pierde el derecho a seguir puntuando.
      state.currentRound.fallenPlayers.push(action.playerId);
    } else {
      // CHISPA / SUPER CHISPA: Hubo coincidencias con otros jugadores.
      const totalInvolved = matches.length + 1;
      // 3 puntos si solo coinciden 2 jugadores (Super Chispa), 2 puntos si son más (Chispa)
      const points = totalInvolved === 2 ? 3 : 2;

      const involvedPlayers = [action.playerId, ...matches];

      involvedPlayers.forEach((pId) => {
        // 1. Registramos el acierto para el cálculo de penalizaciones (ej. castigo "En la Oscuridad")
        state.currentRound.successfulMarks[pId] += 1;

        // 2. Sumamos puntos temporales SOLO si el jugador NO ha caído previamente
        if (!state.currentRound.fallenPlayers.includes(pId)) {
          state.currentRound.roundScores[pId] += points;
        }
      });
    }

    // Pasar el turno al siguiente jugador elegible y comprobar si la ronda terminó
    this.passScoutTurn(state);
    this.checkPhaseAdvancement(state);

    return state;
  }

  // ==========================================
  // FLUJO Y TURNOS
  // ==========================================

  /**
   * Evalúa si se cumplen las condiciones para cambiar de fase (de Marcado a Revelación,
   * o de Revelación a Puntuación/Fin de partida) y aplica las transiciones.
   */
  private checkPhaseAdvancement(state: StellaGameState): void {
    const activePlayers = state.players.filter(
      (p) => !state.disconnectedPlayers.includes(p),
    );

    // TRANSICIÓN DE MARCADO -> REVELACIÓN
    if (state.phase === 'STELLA_MARKING') {
      const allMarked = activePlayers.every(
        (pId) => state.currentRound.playerMarks[pId] !== undefined,
      );

      if (allMarked && activePlayers.length > 1) {
        state.phase = 'STELLA_REVEAL';
        state.currentRound.currentScoutId = activePlayers[0];

        // Calcular quién está "En la Oscuridad" (el jugador que ha hecho más marcas en solitario)
        let maxMarks = -1;
        let playersWithMaxMarks: string[] = [];

        for (const pId of activePlayers) {
          const marksCount = state.currentRound.playerMarks[pId]?.length || 0;
          if (marksCount > maxMarks) {
            maxMarks = marksCount;
            playersWithMaxMarks = [pId];
          } else if (marksCount === maxMarks) {
            playersWithMaxMarks.push(pId);
          }
        }

        // Si hay un único jugador con más marcas que el resto, se le asigna el estado "En la oscuridad"
        state.currentRound.inTheDarkPlayerId =
          playersWithMaxMarks.length === 1 ? playersWithMaxMarks[0] : null;
      }
    }
    // TRANSICIÓN DE REVELACIÓN -> PUNTUACIÓN / FIN DE PARTIDA
    else if (state.phase === 'STELLA_REVEAL') {
      // La ronda termina si todos han caído o si todos han revelado todas sus marcas
      const isRoundOver = activePlayers.every((pId) => {
        const hasFallen = state.currentRound.fallenPlayers.includes(pId);
        const marks = state.currentRound.playerMarks[pId] || [];
        const allRevealed = marks.every((m) =>
          state.currentRound.revealedCards.includes(m),
        );
        return hasFallen || allRevealed;
      });

      if (isRoundOver) {
        // APLICAR PENALIZACIÓN DE "EN LA OSCURIDAD"
        const inTheDarkId = state.currentRound.inTheDarkPlayerId;
        // Si el jugador "en la oscuridad" ha caído, pierde tantos puntos como aciertos haya tenido
        if (
          inTheDarkId &&
          state.currentRound.fallenPlayers.includes(inTheDarkId)
        ) {
          const penalty = state.currentRound.successfulMarks[inTheDarkId] || 0;
          state.currentRound.roundScores[inTheDarkId] -= penalty;
        }

        // VOLCAR PUNTOS TEMPORALES AL MARCADOR GLOBAL
        state.players.forEach((pId) => {
          state.scores[pId] += state.currentRound.roundScores[pId] || 0;
        });

        // CONDICIÓN DE VICTORIA (El primer jugador en llegar a 30 puntos gana)
        const gameFinished = Object.values(state.scores).some(
          (score) => score >= 30,
        );

        if (gameFinished) {
          state.status = 'finished';
          state.phase = 'FINISHED';
          this.determineWinners(state);
        } else {
          state.phase = 'SCORING';
        }
      }
    }
  }

  /**
   * Pasa el turno de revelación al siguiente jugador que siga activo,
   * no haya caído y aún tenga cartas por revelar.
   */
  private passScoutTurn(state: StellaGameState): void {
    const activePlayers = state.players.filter(
      (p) => !state.disconnectedPlayers.includes(p),
    );

    const currentIndex = activePlayers.indexOf(
      state.currentRound.currentScoutId!,
    );
    let nextIndex = (currentIndex + 1) % activePlayers.length;
    let loopCount = 0;

    // Buscar recursivamente (en anillo) al siguiente jugador válido
    while (loopCount < activePlayers.length) {
      const pId = activePlayers[nextIndex];
      const hasFallen = state.currentRound.fallenPlayers.includes(pId);
      const marks = state.currentRound.playerMarks[pId] || [];
      const hasUnrevealed = marks.some(
        (m) => !state.currentRound.revealedCards.includes(m),
      );

      // Si el jugador no ha caído y tiene cartas sin revelar, es su turno
      if (!hasFallen && hasUnrevealed) {
        state.currentRound.currentScoutId = pId;
        return;
      }

      nextIndex = (nextIndex + 1) % activePlayers.length;
      loopCount++;
    }

    // Si nadie cumple las condiciones, ya no hay jugador activo (fin de ronda)
    state.currentRound.currentScoutId = null;
  }

  // ==========================================
  // PREPARACIÓN DE RONDA
  // ==========================================

  /**
   * Prepara el estado para la siguiente ronda: limpia el tablero,
   * baraja el mazo si es necesario y reinicia los contadores.
   */
  public handleNextRound(state: GameState): GameState {
    const stellaState = state as StellaGameState;

    // Descartar las cartas del tablero de la ronda anterior
    if (stellaState.currentRound) {
      if (
        'boardCards' in stellaState.currentRound &&
        Array.isArray(stellaState.currentRound.boardCards)
      ) {
        stellaState.discardPile.push(...stellaState.currentRound.boardCards);
      }
    }

    // Rellenar y barajar el mazo central si no quedan suficientes cartas (15)
    if (stellaState.centralDeck.length < 15) {
      const newDeck = [...stellaState.centralDeck, ...stellaState.discardPile];
      // Algoritmo de Fisher-Yates para barajar
      for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
      }
      stellaState.centralDeck = newDeck;
      stellaState.discardPile = [];
    }

    // Extraer 15 nuevas cartas para el tablero
    const newBoard = stellaState.centralDeck.splice(-15);
    // Palabra estática de ejemplo para la ronda (Debería ser dinámica idealmente)
    const roundWord = 'Bosque Encantado';

    const roundScores: Record<string, number> = {};
    const successfulMarks: Record<string, number> = {};

    // Inicializar contadores a 0 para todos los jugadores
    stellaState.players.forEach((pId) => {
      roundScores[pId] = 0;
      successfulMarks[pId] = 0;
    });

    // Construir la nueva estructura de la ronda
    stellaState.currentRound = {
      word: roundWord,
      boardCards: newBoard,
      playerMarks: {},
      revealedCards: [],
      currentScoutId: null,
      fallenPlayers: [],
      inTheDarkPlayerId: null,
      roundScores,
      successfulMarks,
    };

    // Cambiar la fase a MARCADO para iniciar el nuevo ciclo
    stellaState.phase = 'STELLA_MARKING';

    return stellaState;
  }

  // ==========================================
  // UTILIDADES
  // ==========================================

  /**
   * Verifica que el jugador que intenta realizar una acción esté conectado.
   */
  private validatePlayerActive(state: StellaGameState, playerId: string) {
    if (state.disconnectedPlayers.includes(playerId)) {
      throw new Error('Debes reconectarte antes de realizar una acción.');
    }
  }

  /**
   * Determina quién ha ganado la partida al final comparando los scores.
   * Contempla empates asignando a más de un ganador.
   */
  private determineWinners(state: StellaGameState): void {
    let maxScore = -1;
    let currentWinners: string[] = [];

    for (const [pId, score] of Object.entries(state.scores)) {
      if (score > maxScore) {
        maxScore = score;
        currentWinners = [pId];
      } else if (score === maxScore) {
        currentWinners.push(pId);
      }
    }
    state.winners = currentWinners;
  }
}
