// src/services/game.service.ts
import { Queue } from 'bullmq';

import { prisma } from '../infrastructure/prisma';
import { bullmqConnection } from '../infrastructure/redis';
import { GameRedisRepository } from '../repositories/game.repository';
import { BOARD_CONFIG } from '../shared/constants/board-config';
import {
  PREDEFINED_DECK_KEYS,
  PREDEFINED_DECKS,
} from '../shared/constants/decks';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';
import {
  COIN_REWARDS_BY_RANK,
  COIN_REWARDS_DEFAULT,
} from '../shared/constants/rewards';
import { GameAction, GameState } from '../shared/types';
import { invalidateCache } from '../shared/utils/cache.utils';
import { normalizeGameMode } from '../shared/utils/game-mode.utils';

// ==========================================
// CONFIGURACIÓN DE BULLMQ (Timeouts de turnos)
// ==========================================
export const gameTimeoutsQueue = new Queue('game-timeouts', {
  connection: bullmqConnection,
});

// ==========================================
// TIPO DE RETORNO: Lista de emisiones que el handler ejecutará
// ==========================================
export interface SocketEmission {
  room: string; // ID de sala o de jugador (socket.id / lobbyCode)
  event: string;
  data: unknown;
}

// Definimos la interfaz común para el Strategy Pattern
export interface IGameEngine {
  transition(state: GameState, action: GameAction): GameState;
}

export class GameService {
  constructor(private readonly redisRepo: typeof GameRedisRepository) {}

  /**
   * INICIALIZA LA PARTIDA DESDE EL LOBBY.
   * Devuelve la lista de emisiones que el handler debe enviar por socket.
   */
  public async initializeGame(
    lobbyCode: string,
    lobbyData: any,
    options: { useDynamicPool: boolean } = { useDynamicPool: true },
  ): Promise<SocketEmission[]> {
    const { engine: mode, players } = lobbyData;

    // Obtener los IDs numéricos para buscar en Prisma
    const numericPlayerIds = players.map((p: string) => {
      const num = parseInt(p.replace(ID_PREFIXES.USER, ''));
      return isNaN(num) ? 0 : num;
    });

    let centralDeck: number[] = [];
    const hostId = numericPlayerIds[0];
    const hostData = await prisma.user.findUnique({
      where: { id_user: hostId },
      select: { active_board_id: true },
    });

    const boardIdToUse = hostData?.active_board_id || 1;
    const boardData = await prisma.board.findUnique({
      where: { id_board: boardIdToUse },
    });

    const boardPayload = boardData
      ? {
          id: `${ID_PREFIXES.BOARD}${boardData.id_board}`,
          name: boardData.name,
          url_image: (boardData as any).url_image || '',
        }
      : {
          id: `${ID_PREFIXES.BOARD}1`,
          name: 'CLASSIC',
          url_image: 'tablero_classic.png',
        };

    // Extraer cartas de los mazos (o usar el predeterminado al azar)
    if (options.useDynamicPool) {
      // Extraer cartas de los mazos de los jugadores
      const userDecks = await prisma.deck.findMany({
        where: { id_user: { in: numericPlayerIds } },
        include: { cards: { include: { user_card: true } } },
      });

      userDecks.forEach((deck) => {
        deck.cards.forEach((dc) => {
          if (dc.user_card) centralDeck.push(dc.user_card.id_card);
        });
      });
    } else {
      const keys = PREDEFINED_DECK_KEYS;
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      centralDeck = [...PREDEFINED_DECKS[randomKey]];
    }

    // Lo dejo aqui de momento para definirlo entre todos, quiza luego en costantes para facilitar el acceso
    // He puesto 16 para que si cada jugador pone 12 en el mazo simepre en todas las partidas exisran cartas aleatorias,
    // lo que puede generar cartas que no hayamos visto antes de manera consistente.

    const CARDS_PER_PLAYER = 16;
    const TARGET_DECK_SIZE = players.length * CARDS_PER_PLAYER;

    // Si hay pocas cartas, rellenamos c hasta TARGET_DECK_SIZE Y si los mazos sobrepasan escogemos al azar
    if (centralDeck.length < TARGET_DECK_SIZE) {
      const missingAmount = TARGET_DECK_SIZE - centralDeck.length;
      const fallbackCards = await prisma.cards.findMany({
        take: missingAmount,
        select: { id_card: true },
      });
      centralDeck.push(...fallbackCards.map((c) => c.id_card));
    } else if (centralDeck.length > TARGET_DECK_SIZE) {
      centralDeck = this.shuffleArray(centralDeck).slice(0, TARGET_DECK_SIZE); // Mezclamos antes de cortar para que sea justo
    }

    // Barajamos
    centralDeck = this.shuffleArray(centralDeck);

    const allCardsInfo = await prisma.cards.findMany({
      where: { id_card: { in: centralDeck } },
      select: { id_card: true, url_image: true },
    });

    const cardDictionary: Record<number, string> = {};
    allCardsInfo.forEach((c) => {
      cardDictionary[c.id_card] = c.url_image || '';
    });

    const safeMode = normalizeGameMode(mode) ?? 'STANDARD';

    // Crear el estado base
    const baseState: any = {
      lobbyCode,
      mode: safeMode,
      players,
      disconnectedPlayers: [],
      scores: {},
      hands: {},
      centralDeck,
      discardPile: [],
      phase: safeMode === 'STELLA' ? 'STELLA_WORD_REVEAL' : 'STORYTELLING',
      isStarActive: false,
      isMinigameActive: false,
      activeConflict: null,
      activeBoardId: boardIdToUse,
      boardRegistry: {},
      cardUrls: cardDictionary,
    };

    players.forEach((p: string) => {
      baseState.scores[p] = 0;
      baseState.hands[p] = [];
    });

    const initAction: GameAction = {
      type: 'INIT_GAME',
      playerId: 'SYSTEM',
      payload: { deck: centralDeck },
    };
    const initialState = this.getEngine().transition(baseState, initAction);

    // Guardar el estado inicial en Redis
    await this.redisRepo.saveGame(lobbyCode, initialState);

    const emissions: SocketEmission[] = [];

    emissions.push({
      room: lobbyCode,
      event: 'server:game:started',
      data: {
        state: this.maskPrivateState(initialState),
        board: boardPayload,
        message: '¡La partida ha comenzado!',
      },
    });

    for (const playerId of initialState.players) {
      const handIds = initialState.hands[playerId] as number[];

      // Mapeamos los IDs de la mano a objetos que contengan la URL buscando en la caché
      emissions.push({
        room: playerId,
        event: 'server:game:private_hand',
        data: { hand: this.serializeHand(handIds, cardDictionary) },
      });
    }

    // Arrancar el temporizador inicial (ej: 60s)
    await this.schedulePhaseTimeout(lobbyCode, initialState.phase, 60000);

    return emissions;
  }

  /**
   * PROCESA ACCIONES DURANTE LA PARTIDA.
   * Devuelve la lista de emisiones que el handler debe enviar por socket.
   */
  public async handleAction(
    lobbyCode: string,
    action: GameAction,
  ): Promise<SocketEmission[]> {
    // 1. Recuperar estado crudo desde Redis
    const currentState = await this.redisRepo.getGame(lobbyCode);
    if (!currentState) {
      throw new Error('Partida no encontrada o expirada.');
    }

    // ==========================================
    // SISTEMA DE RECONEXIÓN DE USUARIOS
    // ==========================================
    // Si la acción es reconectar, hidratamos su mano y la preparamos para emitir
    const reconnectEmissions: SocketEmission[] = [];
    if (action.type === 'RECONNECT_PLAYER') {
      const reconnectingPlayerId = action.playerId;
      const handIds = currentState.hands[reconnectingPlayerId] || [];

      if (handIds.length > 0) {
        const hydratedHand = this.serializeHand(
          handIds,
          currentState.cardUrls || {},
        );

        reconnectEmissions.push({
          room: reconnectingPlayerId,
          event: 'server:game:private_hand',
          data: { hand: hydratedHand },
        });
      }
    }

    // ==========================================
    // SISTEMA DE DESCONEXIÓN DURANTE MINIJUEGO
    // ==========================================
    if (
      action.type === 'DISCONNECT_PLAYER' &&
      currentState.isMinigameActive &&
      currentState.activeConflict
    ) {
      const { player1, player2, isDuel } = currentState.activeConflict;
      const disconnectedId = action.playerId;

      // Si el que se ha caído es uno de los peleadores
      if (disconnectedId === player1 || disconnectedId === player2) {
        const winnerId = disconnectedId === player1 ? player2 : player1;

        // Usamos la función que ya tenemos para resolverlo, dándole la victoria al que se quedó
        const conflictEmissions = await this.submitConflictResult(
          lobbyCode,
          winnerId,
          disconnectedId,
          isDuel,
        );
        reconnectEmissions.push(...conflictEmissions);
      }
    }

    // ==========================================
    // SISTEMA DE BLOQUEO Y DUELOS
    // ==========================================
    if (
      currentState.isMinigameActive &&
      action.type !== 'RECONNECT_PLAYER' &&
      action.type !== 'DISCONNECT_PLAYER'
    ) {
      throw new Error(
        'Hay un conflicto en curso. Espera a que termine el minijuego.',
      );
    }

    // Si la acción es iniciar el duelo, lo disparamos sin pasar por el motor
    if (action.type === 'RESOLVE_DUEL') {
      const targetId = (action as any).payload.targetId;
      currentState.isMinigameActive = true;
      currentState.activeConflict = {
        player1: action.playerId,
        player2: targetId,
        isDuel: true,
      };
      await this.redisRepo.saveGame(lobbyCode, currentState);

      // Programamos la cancelación automática por si el frontend falla.
      // Le damos los 15s que dura el juego + 5s de margen de red.
      await gameTimeoutsQueue.add(
        'minigame-fallback',
        { lobbyCode: currentState.lobbyCode },
        {
          delay: 20 * 1000,
          jobId: `conflict-${currentState.lobbyCode}-${Date.now()}`,
          removeOnComplete: true,
        },
      );

      return [
        {
          room: currentState.lobbyCode,
          event: 'server:game:minigame_start',
          data: {
            player1: action.playerId,
            player2: targetId,
            type: Math.floor(Math.random() * 3), // Int 0-2
            duration: 15000,
            isDuel: true, // Bandera clave para saber cómo puntuar al final
          },
        },
      ];
    }

    // 2. PATRÓN STRATEGY: Seleccionar el motor dinámicamente
    const engine: IGameEngine = this.getEngine();

    const oldPhase = currentState.phase;
    const previousScores = { ...currentState.scores };

    // 3. Ejecutar la transición en memoria (Lógica Pura)
    const newState = engine.transition(currentState, action);

    // 4. Comprobar la lógica del tablero — devuelve emisiones adicionales
    const specialEmissions = await this.checkSpecialSquares(
      newState,
      previousScores,
    );

    // 5. Guardar el nuevo estado machacando el anterior
    await this.redisRepo.saveGame(lobbyCode, newState);

    const emissions: SocketEmission[] = [];
    emissions.push(...reconnectEmissions);

    // 6. Ocultar información privada ANTES de enviar a la red general
    const publicState = this.maskPrivateState(newState);

    // 7. Emitir estado público a toda la sala
    emissions.push({
      room: newState.lobbyCode,
      event: 'server:game:state_updated',
      data: { state: publicState, lastAction: action.type },
    });

    // Filtramos para no enviar las manos privadas a todos en las reconexiones
    if (
      action.type !== 'RECONNECT_PLAYER' &&
      action.type !== 'DISCONNECT_PLAYER'
    ) {
      for (let i = 0; i < newState.players.length; i++) {
        const playerId = newState.players[i];
        const handIds = (newState.hands[playerId] as number[]) || [];

        emissions.push({
          room: playerId,
          event: 'server:game:private_hand',
          data: { hand: this.serializeHand(handIds, newState.cardUrls || {}) },
        });
      }
    }

    // 9. Añadir emisiones de casillas especiales
    emissions.push(...specialEmissions);

    // 10. Gestión de Timeouts si cambió de fase
    if (oldPhase !== newState.phase) {
      const timeLimits: Record<string, number> = {
        STORYTELLING: 60000,
        SUBMISSION: 45000,
        VOTING: 45000,
        SCORING: 10000,
      };
      const delay = timeLimits[newState.phase];
      if (delay) {
        await this.schedulePhaseTimeout(lobbyCode, newState.phase, delay);
      }
    }

    // 11. Fin de Partida: Ranking y Monedas

    if (newState.phase === 'FINISHED') {
      const finalEmissions = await this.finalizeGame(lobbyCode);
      emissions.push(...finalEmissions);
    }

    return emissions;
  }

  /**
   * Kicks a player from the active game due to inactivity.
   */
  public async kickPlayer(
    lobbyCode: string,
    userId: string,
  ): Promise<SocketEmission[]> {
    const currentState = await this.redisRepo.getGame(lobbyCode);
    if (!currentState) {
      return [];
    }

    const engine: IGameEngine = this.getEngine();
    const action: GameAction = {
      type: 'KICK_PLAYER',
      playerId: userId,
    };

    const newState = engine.transition(currentState, action);

    // If the game has less than 2 players, we could end it here,
    // but the engine transition (phase advancement check) might also handle it.

    await this.redisRepo.saveGame(lobbyCode, newState);

    const emissions: SocketEmission[] = [];
    const publicState = this.maskPrivateState(newState);

    // Enviar el estado actualizado
    emissions.push({
      room: lobbyCode,
      event: 'server:game:state_updated',
      data: { state: publicState, lastAction: 'KICK_PLAYER' },
    });

    // Notify remaining players about their hand
    // (though kick shouldn't affect their hand, it's good practice to sync)

    for (let i = 0; i < newState.players.length; i++) {
      const playerId = newState.players[i];
      emissions.push({
        room: playerId,
        event: 'server:game:private_hand',
        data: {
          hand: this.serializeHand(
            newState.hands[playerId],
            newState.cardUrls || {},
          ),
        },
      });
    }

    if (newState.phase === 'FINISHED') {
      const finalEmissions = await this.finalizeGame(lobbyCode);
      emissions.push(...finalEmissions);
    }

    return emissions;
  }

  // ==========================================
  // FIN DE PARTIDA: RANKING Y MONEDAS
  // ==========================================

  /**
   * Cierra la partida: calcula el ranking, reparte monedas según la tabla
   * COIN_REWARDS_BY_RANK, persiste los resultados en Prisma y devuelve
   * las emisiones socket (resultado sala + saldo personal por RF-14).
   */
  public async finalizeGame(lobbyCode: string): Promise<SocketEmission[]> {
    // 2. Ordenar jugadores por puntuación (de mayor a menor)
    const currentState = await this.redisRepo.getGame(lobbyCode);
    if (!currentState) {
      throw new Error('Partida no encontrada o expirada.');
    }
    const ranking = Object.entries(currentState.scores)
      .sort(([, a], [, b]) => b - a)
      .map(([playerId, points], index) => ({
        playerId,
        points,
        place: index + 1,
        coinsEarned: COIN_REWARDS_BY_RANK[index + 1] ?? COIN_REWARDS_DEFAULT,
      }));

    // 2. Persistir en Prisma dentro de una transacción
    try {
      const gameDuration = 0; // TODO: calcular duración real cuando se almacene el startedAt
      const gameLog = await prisma.games_log.create({
        data: { duration: gameDuration },
      });

      await prisma.$transaction([
        // Registro de estadísticas por jugador
        ...ranking.map(({ playerId, points, place }) => {
          const numericId = parseInt(playerId.replace(ID_PREFIXES.USER, ''));
          return prisma.userGameStats.create({
            data: {
              id_user: numericId,
              id_game: gameLog.id_game,
              points,
              place,
            },
          });
        }),
        // Incremento atómico de monedas (seguro ante concurrencia)
        ...ranking.map(({ playerId, coinsEarned }) => {
          const numericId = parseInt(playerId.replace(ID_PREFIXES.USER, ''));
          return prisma.user.update({
            where: { id_user: numericId },
            data: { coins: { increment: coinsEarned } },
          });
        }),
      ]);

      // 3. Obtener el saldo actualizado de cada jugador para el evento WALLET_UPDATED
      const updatedBalances = await Promise.all(
        ranking.map(async ({ playerId }) => {
          const numericId = parseInt(playerId.replace(ID_PREFIXES.USER, ''));
          const user = await prisma.user.findUnique({
            where: { id_user: numericId },
            select: { coins: true },
          });
          return { playerId, balance: user?.coins ?? 0 };
        }),
      );

      // 4. Invalidar caché de economía de cada jugador (RF-14)
      await Promise.all(
        ranking.map(({ playerId }) =>
          invalidateCache(`cache:user:economy:${playerId}`),
        ),
      );

      const emissions: SocketEmission[] = [];

      // 5a. Emitir resultados a toda la sala
      emissions.push({
        room: lobbyCode,
        event: 'server:game:ended',
        data: { ranking },
      });

      // 5b. Emitir saldo actualizado a cada jugador por su sala personal (RF-14)
      for (const { playerId, balance } of updatedBalances) {
        emissions.push({
          room: playerId, // Sala personal del jugador (socket.join(userId))
          event: 'server:economy:wallet_updated',
          data: { balance },
        });
      }

      return emissions;
    } catch (error) {
      console.error(
        `[GameService] Error al finalizar la partida ${lobbyCode}:`,
        error,
      );
      return [
        {
          room: lobbyCode,
          event: 'server:game:ended',
          data: { ranking, error: 'No se pudieron guardar las estadísticas.' },
        },
      ];
    }
  }

  // ==========================================
  // FUNCIONES AUXILIARES PRIVADAS
  // ==========================================

  private async schedulePhaseTimeout(
    lobbyCode: string,
    phase: string,
    delayMs: number,
  ) {
    await gameTimeoutsQueue.add(
      'phase-timeout',
      { lobbyCode, expectedPhase: phase },
      {
        delay: delayMs,
        jobId: `timeout-${lobbyCode}-${phase}-${Date.now()}`,
        removeOnComplete: true,
      },
    );
    console.log(
      `[BullMQ] Timeout programado para ${lobbyCode} en fase ${phase} (${delayMs / 1000}s)`,
    );
  }

  private maskPrivateState(state: GameState): Partial<GameState> {
    const publicState = structuredClone(state);
    delete (publicState as any).centralDeck;
    delete (publicState as any).hands;
    delete (publicState as any).cardUrls;
    return publicState;
  }

  //
  // ESTRELLA SÍNCRONA
  //

  public async triggerStarEvent(lobbyCode: string): Promise<SocketEmission[]> {
    const state = await this.redisRepo.getGame(lobbyCode);
    if (!state || state.isStarActive) return [];

    const movement = this.calculateStarPath();

    state.isStarActive = true;
    state.starExpiresAt = Date.now() + movement.duration;
    await this.redisRepo.saveGame(lobbyCode, state);

    const emissions: SocketEmission[] = [];

    emissions.push({
      room: lobbyCode,
      event: 'server:game:star_spawned',
      data: {
        starId: `star_${Date.now()}`,
        path: movement.path,
        duration: movement.duration,
      },
    });

    // Si nadie la pulsa, se desactiva al terminar la duración
    await gameTimeoutsQueue.add(
      'star-expiration',
      { lobbyCode },
      {
        delay: movement.duration,
        removeOnComplete: true,
      },
    );

    return emissions;
  }

  /**
   * Callback opcional que el handler puede inyectar para recibir emisiones diferidas
   * (p.ej. la expiración de la estrella lanzada por setTimeout).
   */
  public _deferredEmitCallback?: (emission: SocketEmission) => void;

  public async claimStar(
    lobbyCode: string,
    playerId: string,
  ): Promise<SocketEmission[]> {
    const state = await this.redisRepo.getGame(lobbyCode);

    if (!state || !state.isStarActive || Date.now() > state.starExpiresAt) {
      return []; // El click llegó tarde o no hay estrella
    }

    state.isStarActive = false;
    state.scores[playerId] = (state.scores[playerId] || 0) + 3;

    await this.redisRepo.saveGame(lobbyCode, state);

    return [
      {
        room: lobbyCode,
        event: 'server:game:star_claimed',
        data: { winnerId: playerId, newScores: state.scores },
      },
    ];
  }

  private getEngine(): IGameEngine {
    const { DixitEngine } = require('../core/engines');
    return DixitEngine;
  }

  /**
   * Calcula una trayectoria aleatoria para la estrella.
   */
  private calculateStarPath() {
    const sides = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
    const startSide = sides[Math.floor(Math.random() * sides.length)];

    let start = { x: 0, y: 0 };
    let end = { x: 0, y: 0 };

    // Lógica basada en el lado de inicio para que cruce la pantalla
    switch (startSide) {
      case 'LEFT':
        start = { x: -10, y: Math.random() * 100 }; // Empieza fuera a la izquierda
        end = { x: 110, y: Math.random() * 100 }; // Muere fuera a la derecha
        break;
      case 'RIGHT':
        start = { x: 110, y: Math.random() * 100 };
        end = { x: -10, y: Math.random() * 100 };
        break;
      case 'TOP':
        start = { x: Math.random() * 100, y: -10 };
        end = { x: Math.random() * 100, y: 110 };
        break;
      case 'BOTTOM':
        start = { x: Math.random() * 100, y: 110 };
        end = { x: Math.random() * 100, y: -10 };
        break;
    }

    // Velocidad: 2-4 segundos
    const duration = Math.floor(Math.random() * 2000) + 2000;

    return {
      path: { start, end },
      duration,
      side: startSide, // Enviamos el lado para que el frontend rote el gráfico
    };
  }

  //
  //  CASILLAS DEL TABLERO
  //

  /**
   * Escanea los movimientos de los jugadores para activar casillas especiales.
   * Devuelve las emisiones generadas, en lugar de emitir directamente.
   */
  private async checkSpecialSquares(
    state: GameState,
    previousScores: Record<string, number>,
  ): Promise<SocketEmission[]> {
    const { SPECIAL_SQUARES, CHECKPOINT_65 } = BOARD_CONFIG;
    const emissions: SocketEmission[] = [];

    // Nos aseguramos de tener el registro global inicializado en el estado
    if (!state.boardRegistry) state.boardRegistry = {};

    // Capturamos las posiciones de llegada antes de aplicar efectos
    // Esto evita que si un jugador empuja a otro a una casilla especial, se activen en cadena.
    // Detectado a través de los tests.
    const arrivalScores = { ...state.scores };

    for (const pId of state.players) {
      const currentPos = arrivalScores[pId];
      const oldPos = previousScores[pId] || 0;

      // Si no se movió, ignoramos
      if (currentPos === oldPos) continue;

      // CASILLAS IMPARES
      if (currentPos === SPECIAL_SQUARES.ODD_SQUARE_1)
        emissions.push(
          ...this.applyStepEffect(
            state,
            pId,
            'ODD',
            SPECIAL_SQUARES.ODD_SQUARE_1,
          ),
        );
      if (currentPos === SPECIAL_SQUARES.ODD_SQUARE_2)
        emissions.push(
          ...this.applyStepEffect(
            state,
            pId,
            'ODD',
            SPECIAL_SQUARES.ODD_SQUARE_2,
          ),
        );

      // CASILLAS PARES
      if (currentPos === SPECIAL_SQUARES.EVEN_SQUARE_1)
        emissions.push(
          ...this.applyStepEffect(
            state,
            pId,
            'EVEN',
            SPECIAL_SQUARES.EVEN_SQUARE_1,
          ),
        );
      if (currentPos === SPECIAL_SQUARES.EVEN_SQUARE_2)
        emissions.push(
          ...this.applyStepEffect(
            state,
            pId,
            'EVEN',
            SPECIAL_SQUARES.EVEN_SQUARE_2,
          ),
        );

      // SHUFFLE
      if (
        currentPos === SPECIAL_SQUARES.SHUFFLE_1 ||
        currentPos === SPECIAL_SQUARES.SHUFFLE_2
      ) {
        if (state.mode === 'STELLA') {
          emissions.push(...this.applyStellaScoreSwap(state, pId));
        } else {
          emissions.push(...(await this.applyShuffleEffect(state, pId)));
        }
      }

      // EQUILIBRIO (Checkpoint)
      if (currentPos === CHECKPOINT_65) {
        emissions.push(...this.applyEquilibriumEffect(state));
      }

      // DUELO
      if (
        currentPos === SPECIAL_SQUARES.BET_DUEL_1 ||
        currentPos === SPECIAL_SQUARES.BET_DUEL_2
      ) {
        emissions.push({
          room: pId,
          event: 'server:game:duel_available',
          data: { challengerId: pId },
        });
      }

      // MINIJUEGOS DESEMPATE
      const conflictEmissions = await this.checkConflictMinigame(state, pId);
      emissions.push(...conflictEmissions);
    }

    return emissions;
  }

  /**
   * Efecto de Impares y Pares: Solo tiene en cuenta la primera vez de cada jugador.
   */
  private applyStepEffect(
    state: GameState,
    pId: string,
    type: 'ODD' | 'EVEN',
    squareId: number,
  ): SocketEmission[] {
    state.boardRegistry[squareId] = state.boardRegistry[squareId] || [];

    if (state.boardRegistry[squareId].includes(pId)) return [];

    state.boardRegistry[squareId].push(pId);

    const order = state.boardRegistry[squareId].length;
    const magnitude = Math.ceil(order / 2);
    let isPositive: boolean;

    if (type === 'ODD') {
      isPositive = order % 2 === 1;
    } else {
      isPositive = order % 2 === 0;
    }

    const points = isPositive ? magnitude : -magnitude;
    state.scores[pId] = Math.max(0, state.scores[pId] + points);

    return [
      {
        room: state.lobbyCode,
        event: 'server:game:special_event',
        data: { pId, effect: type, points, squareId },
      },
    ];
  }

  /**
   * Efecto de Equilibrio: Avanza un punto por puesto actual.
   */
  private applyEquilibriumEffect(state: GameState): SocketEmission[] {
    const ranking = Object.keys(state.scores).sort(
      (a, b) => state.scores[b] - state.scores[a],
    );

    ranking.forEach((pId, index) => {
      const position = index + 1;
      state.scores[pId] += position; // Gana tantos puntos como su puesto
    });

    return [
      {
        room: state.lobbyCode,
        event: 'server:game:special_event',
        data: { effect: 'EQUILIBRIUM' },
      },
    ];
  }

  /**
   * Algoritmo de Fisher-Yates para barajar un array de forma aleatoria y justa.
   */
  private shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  /**
   * Efecto Shuffle: Tira tus cartas y coge nuevas.
   */
  private async applyShuffleEffect(
    state: GameState,
    pId: string,
  ): Promise<SocketEmission[]> {
    const currentHand = state.hands[pId] || [];
    const handSize = currentHand.length;

    if (handSize === 0) return [];

    state.discardPile.push(...currentHand);

    const newHand: number[] = [];
    const emissions: SocketEmission[] = [];

    // Robar cartas una a una asegurando que el mazo nunca se acabe
    for (let i = 0; i < handSize; i++) {
      // Si se acaba el monton del mazo rebarajamos las cartas ya usadas
      if (state.centralDeck.length === 0) {
        if (state.discardPile.length === 0) break;

        // Convertimos el descarte barajado en el nuevo mazo central
        state.centralDeck = this.shuffleArray(state.discardPile);
        state.discardPile = [];

        emissions.push({
          room: state.lobbyCode,
          event: 'server:game:deck_reshuffled',
          data: {},
        });
      }

      const card = state.centralDeck.pop();
      if (card !== undefined) {
        newHand.push(card);
      }
    }

    state.hands[pId] = newHand;

    emissions.push({
      room: pId,
      event: 'server:game:private_hand',
      data: { hand: this.serializeHand(newHand, state.cardUrls || {}) },
    });

    emissions.push({
      room: state.lobbyCode,
      event: 'server:game:special_event',
      data: { pId, effect: 'SHUFFLE' },
    });

    return emissions;
  }

  /**
   * Efecto Shuffle en STELLA: Intercambia los puntos con otro jugador al azar.
   */
  private applyStellaScoreSwap(
    state: GameState,
    pId: string,
  ): SocketEmission[] {
    const otherPlayers = state.players.filter((p) => p !== pId);

    // Si está jugando solo (desarrollo/tests), no hace nada
    if (otherPlayers.length === 0) return [];

    // Elegir un rival al azar
    const randomRival =
      otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

    // Intercambiar puntuaciones
    const myScore = state.scores[pId] || 0;
    const rivalScore = state.scores[randomRival] || 0;

    state.scores[pId] = rivalScore;
    state.scores[randomRival] = myScore;

    return [
      {
        room: state.lobbyCode,
        event: 'server:game:special_event',
        data: {
          pId,
          effect: 'STELLA_SCORE_SWAP',
          targetId: randomRival,
          message: `¡Caos de Stella! Has intercambiado tu puntuación con ${randomRival}.`,
        },
      },
    ];
  }

  private serializeHand(
    handIds: number[],
    cardDictionary: Record<number, string>,
  ) {
    return handIds.map((id) => ({
      id: `${ID_PREFIXES.CARD}${id}`,
      url_image: cardDictionary[id] || '',
    }));
  }

  /**
   * Detecta si el jugador ha aterrizado en la misma puntuaciÃ³n que otro
   * y dispara el evento de minijuego 1vs1.
   */
  private async checkConflictMinigame(
    state: GameState,
    movingPlayerId: string,
  ): Promise<SocketEmission[]> {
    if (state.isMinigameActive) return [];

    const currentScore = state.scores[movingPlayerId];

    // Ignorar la posición 0 (inicio) para no saturar al empezar
    if (currentScore === 0) return [];

    // Buscamos a otro jugador que ya estuviera en esa casilla
    const rivalId = state.players.find(
      (pId) => pId !== movingPlayerId && state.scores[pId] === currentScore,
    );

    if (!rivalId) return [];

    // Configuración del minijuego
    const minigameType = Math.floor(Math.random() * 3); // Int 0-2 (Actualmente 3 tipos de juegos, eto esta hablado con Samu)
    const duration = 15 * 1000; // Actualmente duran 15 segundos cada minijuego.

    // BLOQUEAMOS LA PARTIDA
    state.isMinigameActive = true;

    state.activeConflict = {
      player1: movingPlayerId,
      player2: rivalId,
      isDuel: false,
    };

    // Programamos la cancelación automática por si el frontend falla.
    // Le damos los 15s que dura el juego + 5s de margen de red.
    await gameTimeoutsQueue.add(
      'minigame-fallback',
      { lobbyCode: state.lobbyCode },
      {
        delay: 20 * 1000,
        jobId: `conflict-${state.lobbyCode}-${Date.now()}`,
        removeOnComplete: true,
      },
    );

    return [
      {
        room: state.lobbyCode,
        event: 'server:game:minigame_start',
        data: {
          player1: movingPlayerId,
          player2: rivalId,
          type: minigameType,
          duration: duration,
          isDuel: false, // Es un empate, no un duelo (Para reutilizar la casilla de duelo y los desempates)
        },
      },
    ];
  }

  /**
   * Resuelve el final de un minijuego (tanto Empates como Duelos).
   * Desbloquea la partida y aplica los puntos correspondientes.
   */
  public async submitConflictResult(
    lobbyCode: string,
    winnerId: string,
    loserId: string,
    isDuel: boolean,
  ): Promise<SocketEmission[]> {
    const state = await this.redisRepo.getGame(lobbyCode);
    if (!state || !state.isMinigameActive) return [];

    // 1. Aplicamos los puntos según el tipo de conflicto
    if (isDuel) {
      // Reglas de Duelo: Ganador +2, Perdedor -2 (mínimo 0)
      state.scores[winnerId] = (state.scores[winnerId] || 0) + 2;
      state.scores[loserId] = Math.max(0, (state.scores[loserId] || 0) - 2);
    } else {
      // Reglas de Empate: Ganador +1, Perdedor 0
      state.scores[winnerId] = (state.scores[winnerId] || 0) + 1;
    }

    // 2. Liberamos la partida para que continúe
    state.isMinigameActive = false;
    state.activeConflict = null;
    await this.redisRepo.saveGame(lobbyCode, state);

    // 3. Preparamos las notificaciones
    const emissions: SocketEmission[] = [];

    const message = isDuel
      ? `¡${winnerId} ha ganado el Duelo (+2 puntos) contra ${loserId} (-2 puntos)!`
      : `¡${winnerId} ha ganado el desempate y se lleva +1 punto!`;

    emissions.push({
      room: state.lobbyCode,
      event: 'server:game:special_event',
      data: { effect: 'CONFLICT_RESOLVED', message },
    });

    // Actualizamos el tablero general para todos
    emissions.push({
      room: state.lobbyCode,
      event: 'server:game:state_updated',
      data: {
        state: this.maskPrivateState(state),
        lastAction: 'CONFLICT_RESOLVED',
      },
    });

    return emissions;
  }

  /**
   * Llamado por el Worker de BullMQ si el Frontend nunca responde al minijuego.
   * Cancela el conflicto sin repartir puntos para evitar que la partida muera.
   */
  public async forceUnlockMinigame(
    lobbyCode: string,
  ): Promise<SocketEmission[]> {
    const state = await this.redisRepo.getGame(lobbyCode);

    // Si ya no está activo, el frontend respondió a tiempo
    if (!state || !state.isMinigameActive) return [];

    // Limpiamos los bloqueos forzosamente
    state.isMinigameActive = false;
    state.activeConflict = null;
    await this.redisRepo.saveGame(lobbyCode, state);

    return [
      {
        room: state.lobbyCode,
        event: 'server:game:special_event',
        data: {
          effect: 'CONFLICT_CANCELLED',
          message: 'El minijuego ha sido cancelado por falta de respuesta.',
        },
      },
      {
        room: state.lobbyCode,
        event: 'server:game:state_updated',
        data: {
          state: this.maskPrivateState(state),
          lastAction: 'MINIGAME_TIMEOUT',
        },
      },
    ];
  }
}
