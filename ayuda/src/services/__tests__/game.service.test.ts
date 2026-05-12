import { prisma } from '../../infrastructure/prisma';
import { BOARD_CONFIG } from '../../shared/constants/board-config';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';
import { GameState } from '../../shared/types';
import { GameService, gameTimeoutsQueue } from '../game.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockReturnValue({
    add: jest.fn(),
  }),
}));

jest.mock('../../infrastructure/redis', () => ({
  bullmqConnection: {},
}));

jest.mock('../../infrastructure/prisma', () => ({
  prisma: {
    deck: { findMany: jest.fn() },
    cards: {
      findMany: jest.fn().mockResolvedValue([
        { id_card: 1, url_image: 'url1.jpg' },
        { id_card: 2, url_image: 'url2.jpg' },
        { id_card: 3, url_image: 'url3.jpg' },
      ]),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ active_board_id: 1 }) },
    board: {
      findUnique: jest.fn().mockResolvedValue({
        id_board: 1,
        name: 'Tablero Classic',
        url_image: 'classic.png',
      }),
    },
    userGameStats: { create: jest.fn() },
    games_log: { create: jest.fn().mockResolvedValue({ id_game: 1 }) },
  },
}));

jest.mock('../../core/engines', () => ({
  DixitEngine: { transition: jest.fn((state) => state) },
}));

describe('GameService - Suite Completa de Tablero, Powerups y Minijuegos', () => {
  let gameService: GameService;
  let mockRedisRepo: any;

  beforeAll(() => {
    // 2. Espiamos la cola REAL de BullMQ para interceptar la llamada sin ejecutarla
    jest.spyOn(gameTimeoutsQueue, 'add').mockResolvedValue(undefined as any);
  });

  beforeEach(() => {
    mockRedisRepo = {
      getGame: jest.fn(),
      saveGame: jest.fn(),
    };
    gameService = new GameService(mockRedisRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // FLUJO PRINCIPAL: INITIALIZE Y HANDLE ACTION
  // ==========================================
  describe('Flujo Principal: Inicialización y Acciones', () => {
    describe('initializeGame', () => {
      test('Debe extraer IDs, buscar cartas, NO usar fallback si hay suficientes, y guardar estado', async () => {
        const p1 = `${ID_PREFIXES.USER}1`;
        const p2 = `${ID_PREFIXES.USER}2`;
        const p3 = `${ID_PREFIXES.USER}3`;

        const lobbyData = { engine: 'STANDARD', players: [p1, p2, p3] };
        // 3 jugadores * 16 cartas = 48 cartas requeridas.

        // Simulamos que los jugadores traen MUCHAS cartas (ej: 60 cartas en total) para no entrar al fallback
        const mockDecks = [
          {
            cards: Array(60).fill({
              user_card: {
                id_card: 100,
                card: { id_card: 100, url_image: 'img.png' },
              },
            }),
          },
        ];
        (prisma.deck.findMany as jest.Mock).mockResolvedValueOnce(mockDecks);
        (prisma.cards.findMany as jest.Mock).mockResolvedValueOnce([
          { id_card: 100, url_image: 'img.png' },
        ]);

        const emissions = await gameService.initializeGame(
          'ROOM-INIT',
          lobbyData,
        );

        expect(prisma.deck.findMany).toHaveBeenCalledWith({
          where: { id_user: { in: [1, 2, 3] } },
          include: expect.any(Object),
        });

        // 1. Verifica que NO se llamó al fallback porque tenían 60 cartas (más de las 48 necesarias)
        //    (se llama 1 vez obligatoria para las URLs de las cartas)
        expect(prisma.cards.findMany).toHaveBeenCalledTimes(1);

        // 2. Verifica guardado en Redis y programación del temporizador
        expect(mockRedisRepo.saveGame).toHaveBeenCalledWith(
          'ROOM-INIT',
          expect.any(Object),
        );
        expect(gameTimeoutsQueue.add).toHaveBeenCalledWith(
          'phase-timeout',
          expect.objectContaining({
            lobbyCode: 'ROOM-INIT',
            expectedPhase: 'STORYTELLING',
          }),
          expect.objectContaining({ delay: 60000 }),
        );

        // 3. Verifica las emisiones (1 general + 3 privadas)
        const startEmission = emissions.find(
          (e) => e.event === 'server:game:started',
        );
        expect(startEmission).toBeDefined();
        expect(startEmission!.data).not.toHaveProperty('state.centralDeck'); // Privacidad
        expect(startEmission!.data).not.toHaveProperty('state.cardUrls'); // Sobrecarga
        expect(
          emissions.filter((e) => e.event === 'server:game:private_hand'),
        ).toHaveLength(3);
      });

      test('Debe rellenar con cartas fallback (dinámico) si faltan cartas para el mazo objetivo', async () => {
        const lobbyData = {
          engine: 'STANDARD',
          players: [`${ID_PREFIXES.USER}1`],
        };
        // 1 jugador * 16 cartas = 16 cartas requeridas.

        // Simulamos que el usuario NO tiene cartas en su mazo (0 cartas)
        (prisma.deck.findMany as jest.Mock).mockResolvedValueOnce([]);

        // Simulamos la respuesta del fallback
        (prisma.cards.findMany as jest.Mock).mockResolvedValueOnce(
          Array(16).fill({ id_card: 99, url_image: 'img99.png' }),
        );

        await gameService.initializeGame('ROOM-FALLBACK', lobbyData);

        // Verifica que se llamó al fallback pidiendo EXACTAMENTE las 16 cartas que faltan
        expect(prisma.cards.findMany).toHaveBeenCalledWith({
          take: 16,
          select: { id_card: true },
        });
      });

      test('Debe normalizar un lobby legacy con engine "Stella" y arrancar en modo STELLA', async () => {
        const p1 = `${ID_PREFIXES.USER}1`;
        const p2 = `${ID_PREFIXES.USER}2`;
        const p3 = `${ID_PREFIXES.USER}3`;

        const lobbyData = { engine: 'Stella', players: [p1, p2, p3] };

        const mockDecks = [
          {
            cards: Array(60).fill({
              user_card: {
                id_card: 100,
                card: { id_card: 100, url_image: 'img.png' },
              },
            }),
          },
        ];
        (prisma.deck.findMany as jest.Mock).mockResolvedValueOnce(mockDecks);
        (prisma.cards.findMany as jest.Mock).mockResolvedValueOnce([
          { id_card: 100, url_image: 'img.png' },
        ]);

        await gameService.initializeGame('ROOM-STELLA', lobbyData);

        expect(mockRedisRepo.saveGame).toHaveBeenCalledWith(
          'ROOM-STELLA',
          expect.objectContaining({
            mode: 'STELLA',
            phase: 'STELLA_WORD_REVEAL',
          }),
        );
        expect(gameTimeoutsQueue.add).toHaveBeenCalledWith(
          'phase-timeout',
          expect.objectContaining({
            lobbyCode: 'ROOM-STELLA',
            expectedPhase: 'STELLA_WORD_REVEAL',
          }),
          expect.objectContaining({ delay: 60000 }),
        );
      });
    });

    describe('handleAction', () => {
      test('Debe lanzar error si la partida no existe en Redis', async () => {
        mockRedisRepo.getGame.mockResolvedValueOnce(null);
        const action = { type: 'NEXT_ROUND', playerId: 'p1' } as any;

        await expect(
          gameService.handleAction('INVALID_ROOM', action),
        ).rejects.toThrow('Partida no encontrada o expirada.');
      });

      test('Debe actualizar el estado, enmascarar datos privados y generar emisiones', async () => {
        const mockState = {
          lobbyCode: 'ROOM-ACTION',
          players: ['p1'],
          scores: { p1: 0 },
          hands: { p1: [5, 6] },
          centralDeck: [1, 2, 3],
          phase: 'STORYTELLING',
          cardUrls: { 5: 'img5.png', 6: 'img6.png' },
        };
        mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

        const action = { type: 'NEXT_ROUND', playerId: 'p1' } as any;
        const emissions = await gameService.handleAction('ROOM-ACTION', action);

        // Verifica que machaca el estado anterior en Redis
        expect(mockRedisRepo.saveGame).toHaveBeenCalledWith(
          'ROOM-ACTION',
          expect.any(Object),
        );

        // Verifica el enmascaramiento en la sala general
        const updateEmission = emissions.find(
          (e) => e.event === 'server:game:state_updated',
        );
        expect(updateEmission?.data).not.toHaveProperty('state.centralDeck');
        expect(updateEmission?.data).not.toHaveProperty('state.hands');

        // Verifica que se emite la mano privada solo a p1
        const handEmission = emissions.find(
          (e) => e.event === 'server:game:private_hand',
        );
        expect(handEmission).toBeDefined();
      });

      test('Debe rehidratar y enviar SOLO la mano privada al jugador que se reconecta', async () => {
        const mockState = {
          lobbyCode: 'ROOM-RECONNECT',
          players: ['p1', 'p2'],
          scores: {},
          hands: { p1: [10, 20], p2: [30, 40] },
          phase: 'STORYTELLING',
          cardUrls: {
            10: 'url10.png',
            20: 'url20.png',
            30: 'url30.png',
            40: 'url40.png',
          },
        };
        mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

        const action = { type: 'RECONNECT_PLAYER', playerId: 'p1' } as any;
        const emissions = await gameService.handleAction(
          'ROOM-RECONNECT',
          action,
        );

        // Debe emitir la mano de p1
        const handEmissions = emissions.filter(
          (e) => e.event === 'server:game:private_hand',
        );
        expect(handEmissions).toHaveLength(1); // SOLO se envía a p1, no a p2
        expect(handEmissions[0].room).toBe('p1');

        // Debe comprobar que la mano va hidratada
        const sentHand = (handEmissions[0].data as any).hand;
        expect(sentHand[0]).toHaveProperty('url_image', 'url10.png');
      });

      test('Debe programar un nuevo Timeout en BullMQ si hay un cambio de fase', async () => {
        const mockState = {
          lobbyCode: 'ROOM-PHASE',
          players: ['p1'],
          scores: { p1: 0 },
          hands: { p1: [] },
          phase: 'STORYTELLING',
        };
        mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

        // Forzamos al mock del Motor a devolver un estado en fase SUBMISSION
        const dixitEngineMock = require('../../core/engines').DixitEngine;
        dixitEngineMock.transition.mockReturnValueOnce({
          ...mockState,
          phase: 'SUBMISSION',
        });

        const action = { type: 'NEXT_ROUND', playerId: 'SYS' } as any;
        await gameService.handleAction('ROOM-PHASE', action);

        // Verifica que BullMQ recibe la tarea con el retraso correcto (45000ms para SUBMISSION)
        expect(gameTimeoutsQueue.add).toHaveBeenCalledWith(
          'phase-timeout',
          { lobbyCode: 'ROOM-PHASE', expectedPhase: 'SUBMISSION' },
          expect.objectContaining({ delay: 45000 }),
        );
      });
    });
  });

  // ==========================================
  // CASILLAS DE DESIGUALDAD (Pares/Impares)
  // ==========================================

  describe('Casillas de Desigualdad (Pares/Impares)', () => {
    test('PAR: 1ero en pasar, 4o en pasar, 5o en pasar', async () => {
      const square = BOARD_CONFIG.SPECIAL_SQUARES.EVEN_SQUARE_1;
      const prevScores = { p1: 0, p4: 0, p5: 0 };

      // 1er Jugador (Impar -> Negativo en casilla Par)
      const state1 = {
        players: ['p1'],
        scores: { p1: square },
        boardRegistry: { [square]: [] },
        lobbyCode: 'L',
      } as any;
      await gameService['checkSpecialSquares'](state1, prevScores);
      expect(state1.scores['p1']).toBe(square - 1);

      // 4º Jugador (> Par -> Positivo en casilla Par)
      const state4 = {
        players: ['p4'],
        scores: { p4: square },
        boardRegistry: { [square]: ['a', 'b', 'c'] },
        lobbyCode: 'L',
      } as any;
      await gameService['checkSpecialSquares'](state4, prevScores);
      expect(state4.scores['p4']).toBe(square + 2);

      // 5º Jugador (Impar -> Negativo en casilla Par)
      const state5 = {
        players: ['p5'],
        scores: { p5: square },
        boardRegistry: { [square]: ['a', 'b', 'c', 'd'] },
        lobbyCode: 'L',
      } as any;
      await gameService['checkSpecialSquares'](state5, prevScores);
      expect(state5.scores['p5']).toBe(square - 3);
    });

    test('IMPAR: 1ero en pasar, 4o en pasar, 5o en pasar', async () => {
      const square = BOARD_CONFIG.SPECIAL_SQUARES.ODD_SQUARE_1;
      const prevScores = { p1: 0, p4: 0, p5: 0 };

      // 1er Jugador (Impar -> Positivo en casilla Impar)
      const state1 = {
        players: ['p1'],
        scores: { p1: square },
        boardRegistry: { [square]: [] },
        lobbyCode: 'L',
      } as any;
      await gameService['checkSpecialSquares'](state1, prevScores);
      expect(state1.scores['p1']).toBe(square + 1);

      // 4º Jugador (Par -> Negativo en casilla Impar)
      const state4 = {
        players: ['p4'],
        scores: { p4: square },
        boardRegistry: { [square]: ['a', 'b', 'c'] },
        lobbyCode: 'L',
      } as any;
      await gameService['checkSpecialSquares'](state4, prevScores);
      expect(state4.scores['p4']).toBe(square - 2);

      // 5º Jugador (Impar -> Positivo en casilla Impar)
      const state5 = {
        players: ['p5'],
        scores: { p5: square },
        boardRegistry: { [square]: ['a', 'b', 'c', 'd'] },
        lobbyCode: 'L',
      } as any;
      await gameService['checkSpecialSquares'](state5, prevScores);
      expect(state5.scores['p5']).toBe(square + 3);
    });
  });

  // ==========================================
  // CASILLA DE SHUFFLE E INTERCAMBIO (STELLA)
  // ==========================================
  describe('Casilla de Shuffle / Intercambio', () => {
    test('Debe cambiar la mano del jugador y emitir los avisos en STANDARD', async () => {
      const mockState = {
        lobbyCode: 'LOBBY-1',
        mode: 'STANDARD',
        players: ['p1'],
        scores: { p1: BOARD_CONFIG.SPECIAL_SQUARES.SHUFFLE_1 },
        hands: { p1: [10, 11] },
        centralDeck: [99, 100],
        discardPile: [],
        isMinigameActive: false,
      } as unknown as GameState;

      const previousScores = { p1: 0 };
      await gameService['checkSpecialSquares'](mockState, previousScores);

      expect(mockState.discardPile).toEqual([10, 11]);
      expect(mockState.hands['p1'].length).toBe(2);
      expect(mockState.centralDeck.length).toBe(0);
    });

    test('Debe emitir reshuffled si el mazo central se queda a cero en STANDARD', async () => {
      const mockState = {
        lobbyCode: 'LOBBY-1',
        mode: 'STANDARD',
        players: ['p1'],
        hands: { p1: [10, 11, 12] },
        centralDeck: [99],
        discardPile: [50, 51, 52],
        isMinigameActive: false,
      } as unknown as GameState;

      const emissions = await gameService['applyShuffleEffect'](
        mockState,
        'p1',
      );

      expect(mockState.discardPile).toHaveLength(0);
      expect(mockState.hands['p1']).toHaveLength(3);

      const reshuffleEmission = emissions.find(
        (e) => e.event === 'server:game:deck_reshuffled',
      );
      expect(reshuffleEmission).toBeDefined();
    });

    test('Debe hidratar la mano privada con url_image tras aplicar SHUFFLE', async () => {
      const mockState = {
        lobbyCode: 'LOBBY-2',
        mode: 'STANDARD',
        players: ['p1'],
        hands: { p1: [10, 11] },
        centralDeck: [1, 2],
        discardPile: [],
        isMinigameActive: false,
        cardUrls: { 1: 'img1.png', 2: 'img2.png' },
      } as unknown as GameState;

      const emissions = await gameService['applyShuffleEffect'](
        mockState,
        'p1',
      );
      const handEmission = emissions.find(
        (e) => e.event === 'server:game:private_hand',
      );

      expect(handEmission).toBeDefined();
      expect((handEmission!.data as any).hand).toEqual([
        { id: `${ID_PREFIXES.CARD}2`, url_image: 'img2.png' },
        { id: `${ID_PREFIXES.CARD}1`, url_image: 'img1.png' },
      ]);
    });

    test('Debe intercambiar puntos con otro jugador al azar en modo STELLA', async () => {
      const square = BOARD_CONFIG.SPECIAL_SQUARES.SHUFFLE_1;
      const mockState = {
        lobbyCode: 'LOBBY-1',
        mode: 'STELLA',
        players: ['p1', 'p2', 'p3'],
        scores: { p1: square, p2: 50, p3: 15 },
        boardRegistry: {},
        isMinigameActive: false,
      } as unknown as GameState;

      const previousScores = { p1: 0, p2: 50, p3: 15 };

      // Forzamos Math.random para que elija al índice 1 del array de rivales (['p2', 'p3'][1] -> 'p3')
      jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.9);

      const emissions = await gameService['checkSpecialSquares'](
        mockState,
        previousScores,
      );

      // Verificamos el intercambio (p1 se queda con los 15 de p3, y p3 se queda con la casilla actual de p1)
      expect(mockState.scores['p1']).toBe(15);
      expect(mockState.scores['p3']).toBe(square);

      const swapEmission = emissions.find(
        (e) => e.data && (e.data as any).effect === 'STELLA_SCORE_SWAP',
      );
      expect(swapEmission).toBeDefined();
      expect((swapEmission!.data as any).targetId).toBe('p3');

      jest.spyOn(global.Math, 'random').mockRestore();
    });
  });

  // ==========================================
  // CASILLA DE EQUILIBRIO
  // ==========================================
  describe('Casilla de Equilibrio', () => {
    test('Debe sumar puntos según la clasificación actual (+1 al primero, +2 al segundo...)', () => {
      const mockState = {
        lobbyCode: 'LOBBY-1',
        scores: {
          p1: 65, // 1º
          p2: 50, // 2º
          p3: 40, // 3º
        },
      } as unknown as GameState;

      // Probamos la lógica matemática aislada
      const emissions = gameService['applyEquilibriumEffect'](mockState);

      expect(mockState.scores['p1']).toBe(66); // 65 + 1
      expect(mockState.scores['p2']).toBe(52); // 50 + 2
      expect(mockState.scores['p3']).toBe(43); // 40 + 3

      expect(emissions[0].data).toHaveProperty('effect', 'EQUILIBRIUM');
    });
  });

  // ==========================================
  // CASILLA DE DUELO (APUESTA PUNTOS, NO EL MINIJUEGO DE DESEMPATE)
  // ==========================================
  describe('Duelo:', () => {
    test('Debe emitir disponibilidad de duelo al caer en casilla de apuesta', async () => {
      const square = BOARD_CONFIG.SPECIAL_SQUARES.BET_DUEL_1;
      const mockState = {
        lobbyCode: 'LOBBY-1',
        players: ['p1'],
        scores: { p1: square },
      } as unknown as GameState;

      const emissions = await gameService['checkSpecialSquares'](mockState, {
        p1: 0,
      });

      expect(emissions).toContainEqual({
        room: 'p1',
        event: 'server:game:duel_available',
        data: { challengerId: 'p1' },
      });
    });
  });

  // ==========================================
  // SISTEMA DE ESTRELLA FUGAZ
  // ==========================================
  describe('Sistema de Estrella Fugaz', () => {
    test('triggerStarEvent debe activar la estrella, guardar en Redis y programar en BullMQ', async () => {
      const mockState = {
        lobbyCode: 'LOBBY1',
        isStarActive: false,
        scores: {},
      };
      mockRedisRepo.getGame.mockResolvedValue(mockState);

      const emissions = await gameService.triggerStarEvent('LOBBY1');

      expect(mockState.isStarActive).toBe(true);
      expect(mockRedisRepo.saveGame).toHaveBeenCalled();
      expect(emissions[0].event).toBe('server:game:star_spawned');

      // Ahora que hemos "espiado" la cola correctamente, pasará sin problema
      expect(gameTimeoutsQueue.add).toHaveBeenCalledWith(
        'star-expiration',
        { lobbyCode: 'LOBBY1' },
        expect.objectContaining({ removeOnComplete: true }),
      );
    });

    test('claimStar debe dar 3 puntos y apagar la estrella si se pulsa a tiempo', async () => {
      const mockState = {
        lobbyCode: 'LOBBY1',
        isStarActive: true,
        starExpiresAt: Date.now() + 5000,
        scores: { player1: 10 },
      };
      mockRedisRepo.getGame.mockResolvedValue(mockState);

      await gameService.claimStar('LOBBY1', 'player1');

      expect(mockState.isStarActive).toBe(false);
      expect(mockState.scores['player1']).toBe(13);
    });

    test('claimStar no debe dar puntos ni emitir nada si el tiempo ya expiró', async () => {
      const mockState = {
        lobbyCode: 'LOBBY1',
        isStarActive: true,
        starExpiresAt: Date.now() - 1000,
        scores: { player1: 10 },
      };
      mockRedisRepo.getGame.mockResolvedValue(mockState);

      const emissions = await gameService.claimStar('LOBBY1', 'player1');

      expect(mockState.scores['player1']).toBe(10);
      expect(emissions).toHaveLength(0);
    });
  });

  // ==========================================
  // SISTEMA DE CONFLICTOS: DUELOS Y EMPATES
  // ==========================================
  describe('Sistema de Conflictos y Minijuegos', () => {
    test('Debe bloquear acciones normales si hay un minijuego activo', async () => {
      mockRedisRepo.getGame.mockResolvedValueOnce({
        lobbyCode: 'ROOM-1',
        isMinigameActive: true, // Partida bloqueada
      });

      const action = { type: 'NEXT_ROUND', playerId: 'p1' } as any;

      await expect(gameService.handleAction('ROOM-1', action)).rejects.toThrow(
        'Hay un conflicto en curso. Espera a que termine el minijuego.',
      );
    });

    test('Debe iniciar un Duelo y bloquear la partida al recibir RESOLVE_DUEL', async () => {
      const mockState = {
        lobbyCode: 'ROOM-1',
        isMinigameActive: false,
        phase: 'LOBBY',
        scores: {},
      };
      mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

      const action = {
        type: 'RESOLVE_DUEL',
        playerId: 'p1',
        payload: { targetId: 'p2' },
      } as any;

      // Forzamos el tipo de minijuego (0)
      jest.spyOn(global.Math, 'random').mockReturnValueOnce(0.1);

      const emissions = await gameService.handleAction('ROOM-1', action);

      // Verificamos que se bloqueó la partida
      expect(mockState.isMinigameActive).toBe(true);
      expect(mockRedisRepo.saveGame).toHaveBeenCalledWith('ROOM-1', mockState);

      // Verificamos la emisión del duelo
      const minigameEmission = emissions.find(
        (e) => e.event === 'server:game:minigame_start',
      );
      expect(minigameEmission).toBeDefined();
      expect(minigameEmission?.data).toEqual({
        player1: 'p1',
        player2: 'p2',
        type: 0,
        duration: 15000,
        isDuel: true,
      });

      jest.spyOn(global.Math, 'random').mockRestore();
    });

    test('Debe iniciar un Empate si dos jugadores caen en la misma casilla', async () => {
      const mockState = {
        lobbyCode: 'ROOM-1',
        mode: 'STANDARD',
        players: ['p1', 'p2'],
        scores: { p1: 10, p2: 10 }, // Ambos en la casilla 10
        boardRegistry: {},
      } as unknown as GameState;

      // Simulamos que p1 acaba de moverse a la casilla 10, pero p2 ya estaba ahí
      const previousScores = { p1: 5, p2: 10 };

      const emissions = await gameService['checkSpecialSquares'](
        mockState,
        previousScores,
      );

      // Verificamos que se detecta el empate y se bloquea la partida
      expect(mockState.isMinigameActive).toBe(true);
      const minigameEmission = emissions.find(
        (e) => e.event === 'server:game:minigame_start',
      );
      expect(minigameEmission).toBeDefined();
      expect((minigameEmission?.data as any).isDuel).toBe(false); // Es empate, no duelo
    });

    describe('Resolución de Resultados (submitConflictResult)', () => {
      test('Debe aplicar puntuación de Duelo (+2 / -2) y desbloquear partida', async () => {
        const mockState = {
          lobbyCode: 'ROOM-1',
          isMinigameActive: true,
          scores: { p1: 10, p2: 5 },
        } as unknown as GameState;
        mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

        // p1 gana, p2 pierde, ES un duelo
        const emissions = await gameService.submitConflictResult(
          'ROOM-1',
          'p1',
          'p2',
          true,
        );

        expect(mockState.scores['p1']).toBe(12); // 10 + 2
        expect(mockState.scores['p2']).toBe(3); // 5 - 2
        expect(mockState.isMinigameActive).toBe(false); // Desbloqueado

        const specialEvent = emissions.find(
          (e) => e.event === 'server:game:special_event',
        );
        expect((specialEvent?.data as any).effect).toBe('CONFLICT_RESOLVED');
      });

      test('Debe aplicar puntuación de Empate (+1 / 0) y desbloquear partida', async () => {
        const mockState = {
          lobbyCode: 'ROOM-1',
          isMinigameActive: true,
          scores: { p1: 10, p2: 10 },
        } as unknown as GameState;
        mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

        // p1 gana, p2 pierde, NO es un duelo
        await gameService.submitConflictResult('ROOM-1', 'p1', 'p2', false);

        expect(mockState.scores['p1']).toBe(11); // 10 + 1
        expect(mockState.scores['p2']).toBe(10); // 10 + 0
        expect(mockState.isMinigameActive).toBe(false); // Desbloqueado
      });

      test('No debe bajar de 0 puntos a un jugador en un Duelo', async () => {
        const mockState = {
          lobbyCode: 'ROOM-1',
          isMinigameActive: true,
          scores: { p1: 10, p2: 1 }, // p2 solo tiene 1 punto
        } as unknown as GameState;
        mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

        await gameService.submitConflictResult('ROOM-1', 'p1', 'p2', true);

        expect(mockState.scores['p2']).toBe(0); // 1 - 2 = -1 -> Limitado a 0 por Math.max
      });
    });
  });

  // ==========================================
  // REDES DE SEGURIDAD (DESCONEXIÓN Y TIMEOUTS)
  // ==========================================
  describe('Redes de Seguridad (Desconexión y Watchdog)', () => {
    test('Debe dar la victoria del Duelo (+2/-2) si el oponente tira del cable', async () => {
      const mockState = {
        lobbyCode: 'ROOM-1',
        isMinigameActive: true,
        activeConflict: { player1: 'p1', player2: 'p2', isDuel: true },
        scores: { p1: 10, p2: 10 },
        players: ['p1', 'p2'],
        cardUrls: {},
      } as unknown as GameState;
      mockRedisRepo.getGame.mockResolvedValue(mockState);

      // p2 se desconecta en mitad del duelo
      const action = { type: 'DISCONNECT_PLAYER', playerId: 'p2' } as any;
      const emissions = await gameService.handleAction('ROOM-1', action);

      // Verificamos que p1 gana instantáneamente por abandono de p2
      expect(mockState.scores['p1']).toBe(12); // 10 + 2
      expect(mockState.scores['p2']).toBe(8); // 10 - 2
      expect(mockState.isMinigameActive).toBe(false); // La partida se desbloquea

      const specialEvent = emissions.find(
        (e) => e.event === 'server:game:special_event',
      );
      expect(specialEvent).toBeDefined();
    });

    test('Debe dar la victoria del Empate (+1/0) si el oponente tira del cable', async () => {
      const mockState = {
        lobbyCode: 'ROOM-1',
        isMinigameActive: true,
        activeConflict: { player1: 'p1', player2: 'p2', isDuel: false },
        scores: { p1: 10, p2: 10 },
        players: ['p1', 'p2'],
        cardUrls: {},
      } as unknown as GameState;
      mockRedisRepo.getGame.mockResolvedValue(mockState);

      // En este caso, p1 pierde la conexión
      const action = { type: 'DISCONNECT_PLAYER', playerId: 'p1' } as any;
      await gameService.handleAction('ROOM-1', action);

      // Verificamos que p2 gana instantáneamente
      expect(mockState.scores['p2']).toBe(11); // 10 + 1
      expect(mockState.scores['p1']).toBe(10); // 10 + 0
      expect(mockState.isMinigameActive).toBe(false);
    });

    test('Debe ignorar la desconexión (y mantener el bloqueo) si se cae un espectador', async () => {
      const mockState = {
        lobbyCode: 'ROOM-1',
        isMinigameActive: true,
        activeConflict: { player1: 'p1', player2: 'p2', isDuel: true },
        scores: { p1: 10, p2: 10, p3: 5 }, // p3 está mirando
        players: ['p1', 'p2', 'p3'],
        disconnectedPlayers: [],
        hands: { p1: [], p2: [], p3: [] },
        phase: 'STORYTELLING',
        mode: 'STANDARD',
      } as unknown as GameState;
      mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

      // Se desconecta p3 (que NO está en el duelo)
      const action = { type: 'DISCONNECT_PLAYER', playerId: 'p3' } as any;

      // Debe procesar la acción y devolver el estado.
      const emissions = await gameService.handleAction('ROOM-1', action);

      // Verificamos que el duelo SIGUE ACTIVO (nadie ha ganado aún)
      expect(mockState.isMinigameActive).toBe(true);
      expect(mockState.scores['p1']).toBe(10);
      expect(mockState.scores['p2']).toBe(10);

      const stateUpdateEmission = emissions.find(
        (e) => e.event === 'server:game:state_updated',
      );
      expect(stateUpdateEmission).toBeDefined();
      // Verificamos que la acción reflejada en el socket fue la de desconexión
      expect((stateUpdateEmission!.data as any).lastAction).toBe(
        'DISCONNECT_PLAYER',
      );
    });

    test('forceUnlockMinigame debe cancelar el duelo sin dar puntos si el Frontend falla', async () => {
      const mockState = {
        lobbyCode: 'ROOM-1',
        isMinigameActive: true,
        activeConflict: { player1: 'p1', player2: 'p2', isDuel: true },
        scores: { p1: 10, p2: 10 }, // Puntuaciones iniciales
      } as unknown as GameState;
      mockRedisRepo.getGame.mockResolvedValueOnce(mockState);

      // Simulamos que BullMQ llama a la función de rescate a los 20 segundos
      const emissions = await gameService.forceUnlockMinigame('ROOM-1');

      // Verificamos que el estado se limpia por la fuerza
      expect(mockState.isMinigameActive).toBe(false);
      expect(mockState.activeConflict).toBeNull();

      // Verificamos que nadie ha ganado ni perdido puntos
      expect(mockState.scores['p1']).toBe(10);
      expect(mockState.scores['p2']).toBe(10);

      // Verificamos la emisión de cancelación
      const cancelEmission = emissions.find(
        (e) => e.event === 'server:game:special_event',
      );
      expect((cancelEmission?.data as any).effect).toBe('CONFLICT_CANCELLED');
    });
  });
});
