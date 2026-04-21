import { GameState, StellaGameState } from '../../../shared/types';
import { DixitEngine } from '../dixit.engine';

describe('DixitEngine - Simulación de Ronda Completa (Stella)', () => {
  test('Flujo completo de ronda con Chispas, Caídas, penalidad En la Oscuridad y avance dinámico', () => {
    // 1. ESTADO INICIAL PREPARADO PARA STELLA (Actualizado con nuevas propiedades)
    let state: GameState = {
      lobbyCode: 'TEST-STELLA',
      status: 'playing',
      mode: 'STELLA',
      phase: 'STELLA_MARKING',
      players: ['P1', 'P2', 'P3', 'P4'],
      disconnectedPlayers: [],
      winners: [],
      scores: { P1: 0, P2: 0, P3: 0, P4: 0 },
      hands: {},
      centralDeck: Array.from({ length: 30 }, (_, i) => i + 100),
      discardPile: [],
      boardRegistry: {},
      activeModifiers: {},
      isStarActive: false,
      starExpiresAt: 0,
      isMinigameActive: false,
      currentRound: {
        word: 'Universo',
        boardCards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        playerMarks: {},
        revealedCards: [],
        currentScoutId: null,
        fallenPlayers: [],
        inTheDarkPlayerId: null,
        roundScores: { P1: 0, P2: 0, P3: 0, P4: 0 },
        successfulMarks: { P1: 0, P2: 0, P3: 0, P4: 0 },
      },
    } as StellaGameState;

    // 2. FASE: MARCADO SECRETO
    // Modificamos a P1 para que marque 3 cartas y se quede "En la Oscuridad"
    state = DixitEngine.transition(state, {
      type: 'STELLA_SUBMIT_MARKS',
      playerId: 'P1',
      payload: { cardIds: [1, 2, 4] }, // 3 marcas (Máximo) -> En la Oscuridad
    });
    state = DixitEngine.transition(state, {
      type: 'STELLA_SUBMIT_MARKS',
      playerId: 'P2',
      payload: { cardIds: [1, 3] }, // 2 marcas
    });
    state = DixitEngine.transition(state, {
      type: 'STELLA_SUBMIT_MARKS',
      playerId: 'P3',
      payload: { cardIds: [2] }, // 1 marca
    });

    // Al enviar el último jugador, avanzamos a la fase de revelación
    state = DixitEngine.transition(state, {
      type: 'STELLA_SUBMIT_MARKS',
      playerId: 'P4',
      payload: { cardIds: [1] }, // 1 marca
    });

    const stellaState = state as StellaGameState;
    expect(stellaState.phase).toBe('STELLA_REVEAL');
    expect(stellaState.currentRound.currentScoutId).toBe('P1');
    expect(stellaState.currentRound.inTheDarkPlayerId).toBe('P1'); // Verificamos que P1 está en la oscuridad

    // 3. FASE: REVELACIÓN POR TURNOS

    // Turno 1 (P1): Revela la carta 1.
    // Coincide con P2 y P4 (Chispa Normal: 2 puntos temporales para P1, P2 y P4).
    state = DixitEngine.transition(state, {
      type: 'STELLA_REVEAL_MARK',
      playerId: 'P1',
      payload: { cardId: 1 },
    });

    // Los puntos globales deben seguir en 0
    expect(state.scores['P1']).toBe(0);

    // Los puntos temporales suben
    expect((state as StellaGameState).currentRound.roundScores['P1']).toBe(2);
    expect((state as StellaGameState).currentRound.roundScores['P2']).toBe(2);
    expect((state as StellaGameState).currentRound.roundScores['P4']).toBe(2);
    expect((state as StellaGameState).currentRound.successfulMarks['P1']).toBe(
      1,
    );
    expect((state as StellaGameState).currentRound.currentScoutId).toBe('P2');

    // Turno 2 (P2): Revela la carta 3.
    // Nadie más la marcó (Caída). P2 va a fallenPlayers.
    state = DixitEngine.transition(state, {
      type: 'STELLA_REVEAL_MARK',
      playerId: 'P2',
      payload: { cardId: 3 },
    });

    expect((state as StellaGameState).currentRound.fallenPlayers).toContain(
      'P2',
    );
    expect((state as StellaGameState).currentRound.currentScoutId).toBe('P3');

    // Turno 3 (P3): Revela la carta 2.
    // Coincide SOLO con P1 (Súper Chispa: 3 puntos temporales para P1 y P3).
    state = DixitEngine.transition(state, {
      type: 'STELLA_REVEAL_MARK',
      playerId: 'P3',
      payload: { cardId: 2 },
    });

    expect((state as StellaGameState).currentRound.roundScores['P1']).toBe(5); // 2 de antes + 3 nuevos
    expect((state as StellaGameState).currentRound.roundScores['P3']).toBe(3); // 0 de antes + 3 nuevos
    expect((state as StellaGameState).currentRound.successfulMarks['P1']).toBe(
      2,
    ); // P1 lleva 2 aciertos

    // El motor debería saltarse a P4 porque su única marca (la 1) ya está revelada.
    // El turno vuelve a P1.
    expect((state as StellaGameState).currentRound.currentScoutId).toBe('P1');

    // Turno 4 (P1): Revela la carta 4.
    // Nadie más la marcó. P1 (que estaba En la Oscuridad) se cae.
    state = DixitEngine.transition(state, {
      type: 'STELLA_REVEAL_MARK',
      playerId: 'P1',
      payload: { cardId: 4 },
    });

    // Como P1 y P2 están caídos, y P3 y P4 revelaron todo, la ronda termina automáticamente.
    // Se aplica la penalización a P1: tenías 5 puntos temporales, pero como estás en la oscuridad
    // y te caíste, pierdes 1 punto por cada acierto previo (2 aciertos = -2 puntos).
    // Total P1: 5 - 2 = 3 puntos volcados al marcador final.
    expect(state.phase).toBe('SCORING');

    expect(state.scores['P1']).toBe(3);
    expect(state.scores['P2']).toBe(2); // P2 acertó la 1 antes de caerse
    expect(state.scores['P3']).toBe(3);
    expect(state.scores['P4']).toBe(2);

    // 4. AVANCE A LA SIGUIENTE RONDA
    state = DixitEngine.transition(state, {
      type: 'NEXT_ROUND',
      playerId: 'system',
    });

    expect(state.phase).toBe('STELLA_MARKING');

    // Las 15 cartas de la mesa anterior deben ir al descarte
    expect(state.discardPile).toHaveLength(15);
    expect(state.discardPile).toEqual(
      expect.arrayContaining([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      ]),
    );

    // Debe haber 15 cartas nuevas en la mesa sacadas del mazo central
    const newStellaState = state as StellaGameState;
    expect(newStellaState.currentRound.boardCards).toHaveLength(15);
    expect(newStellaState.centralDeck).toHaveLength(15); // Empezamos con 30, restan 15

    // El estado interno de Stella debe haberse limpiado
    expect(newStellaState.currentRound.revealedCards).toHaveLength(0);
    expect(newStellaState.currentRound.fallenPlayers).toHaveLength(0);
    expect(newStellaState.currentRound.inTheDarkPlayerId).toBeNull();
    expect(Object.keys(newStellaState.currentRound.playerMarks)).toHaveLength(
      0,
    );
    expect(newStellaState.currentRound.roundScores['P1']).toBe(0);
  });
});
