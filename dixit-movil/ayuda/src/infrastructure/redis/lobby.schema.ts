import { Repository, Schema } from 'redis-om';

import { redisClient } from '../redis';

export const lobbySchema = new Schema(
  'lobby',
  {
    lobbyCode: { type: 'string' },
    name: { type: 'string' },
    hostId: { type: 'string' },
    players: { type: 'string[]' },
    maxPlayers: { type: 'number' },
    engine: { type: 'string' }, // 'STANDARD' | 'STELLA'
    isPrivate: { type: 'boolean' },
    status: { type: 'string' },
  },
  {
    dataStructure: 'JSON',
  },
);

export const lobbyRepository = new Repository(lobbySchema, redisClient as any);
