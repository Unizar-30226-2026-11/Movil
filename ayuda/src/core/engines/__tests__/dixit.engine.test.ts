import { GameState } from '../../../shared/types';
import { DixitEngine } from '../dixit.engine';

describe('DixitEngine - Simulación de Ronda Completa (Standard)', () => {
  test('Flujo completo de ronda con puntuación parcial y bonos por engaño', () => {
    // 1. ESTADO INICIAL PREPARADO
    // Forzamos a que P1 sea el narrador para tener control del test
    let state: GameState = {
      lobbyCode: 'TEST-1',
      status: 'playing',
      mode: 'STANDARD',
      phase: 'STORYTELLING',
      players: ['P1', 'P2', 'P3', 'P4'],
      disconnectedPlayers: [],
      scores: { P1: 0, P2: 0, P3: 0, P4: 0 },
      hands: {
        P1: [10, 11, 12, 13, 14, 15],
        P2: [20, 21, 22, 23, 24, 25],
        P3: [30, 31, 32, 33, 34, 35],
        P4: [40, 41, 42, 43, 44, 45],
      },
      centralDeck: Array.from({ length: 20 }, (_, i) => i + 100),
      discardPile: [],
      currentRound: {
        storytellerId: 'P1',
        clue: null,
        storytellerCardId: null,
        playedCards: {},
        boardCards: [],
        votes: [],
      },
    } as any; // Usamos as any temporalmente para inyectar el estado falso

    // 2. FASE: NARRACIÓN (P1 elige la carta 10)
    state = DixitEngine.transition(state, {
      type: 'SEND_STORY',
      playerId: 'P1',
      payload: { cardId: 10, clue: 'Un viaje espacial' },
    });

    expect(state.phase).toBe('SUBMISSION');
    expect((state.currentRound as any).clue).toBe('Un viaje espacial');

    // 3. FASE: ENVÍO DE CARTAS (P2, P3 y P4 intentan engañar)
    state = DixitEngine.transition(state, {
      type: 'SUBMIT_CARD',
      playerId: 'P2',
      payload: { cardId: 20 },
    });
    state = DixitEngine.transition(state, {
      type: 'SUBMIT_CARD',
      playerId: 'P3',
      payload: { cardId: 30 },
    });

    // Al enviar la última carta, la fase debe avanzar a VOTING y las cartas deben ir a la mesa
    state = DixitEngine.transition(state, {
      type: 'SUBMIT_CARD',
      playerId: 'P4',
      payload: { cardId: 40 },
    });

    expect(state.phase).toBe('VOTING');
    expect(state.currentRound.boardCards).toHaveLength(4);
    expect(state.currentRound.boardCards).toEqual(
      expect.arrayContaining([10, 20, 30, 40]),
    );

    // 4. FASE: VOTACIÓN
    // Escenario de prueba:
    // - P2 acierta (vota la 10 de P1).
    // - P3 es engañado por P2 (vota la 20 de P2).
    // - P4 acierta (vota la 10 de P1).
    state = DixitEngine.transition(state, {
      type: 'CAST_VOTE',
      playerId: 'P2',
      payload: { cardId: 10 },
    });
    state = DixitEngine.transition(state, {
      type: 'CAST_VOTE',
      playerId: 'P3',
      payload: { cardId: 20 },
    });

    // Al emitir el último voto, se calculan las puntuaciones y se avanza a SCORING
    state = DixitEngine.transition(state, {
      type: 'CAST_VOTE',
      playerId: 'P4',
      payload: { cardId: 10 },
    });

    expect(state.phase).toBe('SCORING');

    // 5. VERIFICACIÓN DE PUNTUACIONES MATEMÁTICAS
    // P1 (Narrador): Hubo acierto parcial, gana 3 puntos.
    expect(state.scores['P1']).toBe(3);

    // P2: Acertó (3 pts) + Engañó a P3 (1 pt) = 4 puntos.
    expect(state.scores['P2']).toBe(4);

    // P3: Falló (0 pts) + Nadie le votó (0 pts) = 0 puntos.
    expect(state.scores['P3']).toBe(0);

    // P4: Acertó (3 pts) + Nadie le votó (0 pts) = 3 puntos.
    expect(state.scores['P4']).toBe(3);

    // 6. AVANCE A LA SIGUIENTE RONDA
    state = DixitEngine.transition(state, {
      type: 'NEXT_ROUND',
      playerId: 'system',
    });

    expect(state.phase).toBe('STORYTELLING');

    // Las cartas jugadas (4) deben estar en la pila de descartes
    expect(state.discardPile).toHaveLength(4);
    expect(state.discardPile).toEqual(expect.arrayContaining([10, 20, 30, 40]));

    // El narrador debe haber rotado al siguiente jugador
    expect((state.currentRound as any).storytellerId).toBe('P2');

    // Todos deben haber robado una carta nueva para tener 6 otra vez
    expect(state.hands['P1']).toHaveLength(6);
    expect(state.hands['P2']).toHaveLength(6);
  });
});
