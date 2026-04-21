// src/sockets/handlers/game.handlers.ts
import { Server } from 'socket.io';
import { z } from 'zod';

import { GameRedisRepository } from '../../repositories/game.repository';
import { GameService, SocketEmission } from '../../services/game.service';
import { AuthenticatedSocket } from '../middleware/socket-auth.middleware';

const MinigameScoreSchema = z.object({
  lobbyCode: z.string().length(4),
  score: z.number(),
});

const pendingConflictScores = new Map<string, Record<string, number>>();

function clearPendingScoresForLobby(lobbyCode: string): void {
  for (const key of pendingConflictScores.keys()) {
    if (key.startsWith(`${lobbyCode}:`)) {
      pendingConflictScores.delete(key);
    }
  }
}

function clearStalePendingScores(lobbyCode: string, activeConflictKey: string): void {
  for (const key of pendingConflictScores.keys()) {
    if (key.startsWith(`${lobbyCode}:`) && key !== activeConflictKey) {
      pendingConflictScores.delete(key);
    }
  }
}

const GameActionSchema = z.object({
  lobbyCode: z.string().length(4, 'Código de sala inválido'),
  actionType: z.string(),
  payload: z.any().optional(),
});

/**
 * Ejecuta todas las emisiones devueltas por el service.
 * Esta función es el único punto del handler que habla con Socket.io.
 */
function dispatchEmissions(io: Server, emissions: SocketEmission[]): void {
  for (const { room, event, data } of emissions) {
    io.to(room).emit(event, data);
  }
}

export const registerGameHandlers = (
  io: Server,
  socket: AuthenticatedSocket,
) => {
  const gameService = new GameService(GameRedisRepository);

  // Inyectamos el callback para emisiones diferidas (ej: expiración de estrella)
  gameService._deferredEmitCallback = (emission: SocketEmission) => {
    io.to(emission.room).emit(emission.event, emission.data);
  };

  // ──────────────────────────────────────────────
  // ÚNICO canal de acciones para el juego
  // ──────────────────────────────────────────────
  socket.on('client:game:action', async (rawPayload: unknown) => {
    try {
      const result = GameActionSchema.safeParse(rawPayload);
      if (!result.success) {
        socket.emit('server:error', { message: 'Formato de acción inválido' });
        return;
      }

      const { lobbyCode, actionType, payload } = result.data;
      const userId = socket.user?.id;
      if (!userId) {
        socket.emit('server:error', { message: 'No autenticado' });
        return;
      }

      const action: any = {
        type: actionType,
        playerId: userId,
        payload: payload || {},
      };

      // El service ejecuta la lógica y devuelve qué hay que emitir
      const emissions = await gameService.handleAction(lobbyCode, action);
      dispatchEmissions(io, emissions);
    } catch (error: any) {
      socket.emit('server:error', { message: error.message });
    }
  });

  // ──────────────────────────────────────────────
  // ESTRELLA: disparar evento
  // ──────────────────────────────────────────────
  socket.on('client:game:trigger_star', async (rawPayload: unknown) => {
    try {
      const { lobbyCode } = rawPayload as { lobbyCode: string };
      const emissions = await gameService.triggerStarEvent(lobbyCode);
      dispatchEmissions(io, emissions);
    } catch (error: unknown) {
      socket.emit('server:error', { message: (error as Error).message });
    }
  });

  // ──────────────────────────────────────────────
  // ESTRELLA: reclamar
  // ──────────────────────────────────────────────
  socket.on('client:game:claim_star', async (rawPayload: unknown) => {
    try {
      const { lobbyCode } = rawPayload as { lobbyCode: string };
      const userId = socket.user?.id;
      if (!userId) {
        socket.emit('server:error', { message: 'No autenticado' });
        return;
      }

      const emissions = await gameService.claimStar(lobbyCode, userId);
      dispatchEmissions(io, emissions);
    } catch (error: unknown) {
      socket.emit('server:error', { message: (error as Error).message });
    }
  });

  socket.on('client:game:submit_minigame_score', async (rawPayload: unknown) => {
    try {
      const result = MinigameScoreSchema.safeParse(rawPayload);
      if (!result.success) {
        socket.emit('server:error', { message: 'Formato de puntuacion invalido' });
        return;
      }

      const userId = socket.user?.id;
      if (!userId) {
        socket.emit('server:error', { message: 'No autenticado' });
        return;
      }

      const { lobbyCode, score } = result.data;
      const state = await GameRedisRepository.getGame(lobbyCode);
      if (!state?.isMinigameActive || !state.activeConflict) {
        clearPendingScoresForLobby(lobbyCode);
        socket.emit('server:error', { message: 'No hay ningun minijuego activo.' });
        return;
      }

      const { player1, player2, isDuel } = state.activeConflict;
      if (userId !== player1 && userId !== player2) {
        socket.emit('server:error', { message: 'No participas en este minijuego.' });
        return;
      }

      const conflictKey = `${lobbyCode}:${player1}:${player2}:${isDuel ? 'duel' : 'tie'}`;
      clearStalePendingScores(lobbyCode, conflictKey);
      const storedScores = pendingConflictScores.get(conflictKey) ?? {};
      storedScores[userId] = score;
      pendingConflictScores.set(conflictKey, storedScores);

      if (
        typeof storedScores[player1] !== 'number' ||
        typeof storedScores[player2] !== 'number'
      ) {
        return;
      }

      const winnerId = storedScores[player1] >= storedScores[player2] ? player1 : player2;
      const loserId = winnerId === player1 ? player2 : player1;
      pendingConflictScores.delete(conflictKey);

      const emissions = await gameService.submitConflictResult(
        lobbyCode,
        winnerId,
        loserId,
        isDuel,
      );
      dispatchEmissions(io, emissions);
    } catch (error: unknown) {
      socket.emit('server:error', { message: (error as Error).message });
    }
  });

  //Finalizar partida
  socket.on('client:game:end', async (rawPayload: unknown) => {
    try {
      const { lobbyCode } = rawPayload as { lobbyCode: string };
      const emissions = await gameService.finalizeGame(lobbyCode);
      dispatchEmissions(io, emissions);
    } catch (error: unknown) {
      socket.emit('server:error', { message: (error as Error).message });
    }
  });
};
