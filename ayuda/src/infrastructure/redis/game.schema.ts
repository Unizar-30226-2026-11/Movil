import { Repository, Schema } from 'redis-om';

import { redisClient } from '../redis';

export const gameStateSchema = new Schema(
  'game_state',
  {
    lobbyCode: { type: 'string' }, // Usaremos el lobbyCode como ID
    mode: { type: 'string' }, // 'STANDARD' | 'STELLA'
    phase: { type: 'string' },
    status: { type: 'string' },

    // Guardamos como strings para serializar los Record<> y tipos complejos de las interfaces
    players: { type: 'string[]' },
    disconnectedPlayers: { type: 'string[]' },
    scores: { type: 'string' }, // JSON: Record<string, number>
    hands: { type: 'string' }, // JSON: Record<string, number[]>
    centralDeck: { type: 'string' }, // JSON: number[]
    discardPile: { type: 'string' }, // JSON: number[]
    currentRound: { type: 'string' }, // JSON: StandardRound | StellaRound
    cardUrls: { type: 'string' }, // JSON: Record<number, string>

    // Powerup: Estrella Fugaz
    isStarActive: { type: 'boolean' },
    starExpiresAt: { type: 'number' },

    // Para las casilas del tablero
    // Registro de visitas a casillas: Record<SquareID, PlayerID[]>
    boardRegistry: { type: 'string' },

    isMinigameActive: { type: 'boolean' },
    activeConflict: { type: 'string' }, // JSON: { player1, player2, isDuel }
    activeBoardId: { type: 'number' },
  },
  { dataStructure: 'JSON' },
);

export const gameRepository = new Repository(
  gameStateSchema,
  redisClient as any,
);
