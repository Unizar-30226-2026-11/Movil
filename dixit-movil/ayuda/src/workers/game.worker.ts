//Este código lee el estado, deduce quién falta por jugar y genera las acciones correspondientes.

// src/workers/game.worker.ts
import { Job, Worker } from 'bullmq';
import { Server } from 'socket.io';

import { bullmqConnection } from '../infrastructure/redis';
import { GameRedisRepository } from '../repositories/game.repository';
import { GameService, SocketEmission } from '../services/game.service';
import { GameAction } from '../shared/types';

function dispatchEmissions(io: Server, emissions: SocketEmission[]): void {
  for (const { room, event, data } of emissions) {
    io.to(room).emit(event, data);
  }
}

// En desarrollo estamos priorizando estabilidad del flujo manual.
// Los timeouts automáticos de fase están adelantando rondas demasiado pronto,
// así que los desactivamos temporalmente y dejamos solo el fallback del minijuego.
const ENABLE_PHASE_TIMEOUT_AUTOPLAY = false;

export const initializeGameWorker = (io: Server) => {
  // Necesitamos instanciar el GameService para poder llamarlo
  const gameService = new GameService(GameRedisRepository);

  const gameWorker = new Worker(
    'game-timeouts', // Mismo nombre que la Queue en game.service.ts
    async (job: Job) => {
      const { lobbyCode, expectedPhase, executeAfter } = job.data as {
        lobbyCode?: string;
        expectedPhase?: string;
        executeAfter?: number;
      };

      try {
        console.log(
          `[Worker] Evaluando timeout para la sala ${lobbyCode} (Fase: ${expectedPhase})`,
        );

        if (!lobbyCode) return;

        if (typeof executeAfter === 'number') {
          const remainingMs = executeAfter - Date.now();
          if (remainingMs > 1000) {
            await job.queue.add(
              job.name,
              job.data,
              {
                delay: remainingMs,
                removeOnComplete: true,
                jobId: `${job.name}-${lobbyCode}-${executeAfter}-${Date.now()}`,
              },
            );
            console.warn(
              `[Worker] Job ${job.name} para ${lobbyCode} llegó ${remainingMs}ms antes. Reprogramado.`,
            );
            return;
          }
        }

        if (job.name === 'minigame-fallback') {
          const emissions = await gameService.forceUnlockMinigame(lobbyCode);
          dispatchEmissions(io, emissions);
          return;
        }

        if (job.name === 'star-expiration') {
          return;
        }

        if (job.name !== 'phase-timeout') {
          return;
        }

        if (!ENABLE_PHASE_TIMEOUT_AUTOPLAY) {
          console.log(
            `[Worker] Timeout de fase ignorado temporalmente para ${lobbyCode} (${expectedPhase}).`,
          );
          return;
        }

        // 1. Obtener estado actual
        const state: any = await GameRedisRepository.getGame(lobbyCode);
        if (!state) return;

        // 2. Comprobar que no hayan avanzado ya de fase manualmente
        if (state.phase !== expectedPhase) {
          console.log(
            `[Worker] La sala ${lobbyCode} ya no está en ${expectedPhase}. Ignorando timer.`,
          );
          return;
        }

        // 3. ACTUAR COMO UN BOT DEPENDIENDO DE LA FASE
        switch (expectedPhase) {
          case 'STORYTELLING': {
            // Si el Narrador no ha puesto pista, lo forzamos.
            const storytellerId = state.currentRound.storytellerId;
            if (!state.currentRound.clue) {
              const hand = state.hands[storytellerId];
              const randomCard = hand[Math.floor(Math.random() * hand.length)];

              const action: GameAction = {
                type: 'SEND_STORY',
                playerId: storytellerId,
                payload: { cardId: randomCard, clue: 'El tiempo es oro (AFK)' },
              };
              const emissions = await gameService.handleAction(lobbyCode, action);
              dispatchEmissions(io, emissions);
            }
            break;
          }

          case 'SUBMISSION': {
            // Buscamos a los jugadores que NO están en playedCards
            const playedPlayers = Object.keys(
              state.currentRound.playedCards || {},
            );
            const afkPlayers = state.players.filter(
              (pId: string) =>
                pId !== state.currentRound.storytellerId &&
                !playedPlayers.includes(pId),
            );

            // Jugamos una carta aleatoria por cada uno
            for (const afkId of afkPlayers) {
              const hand = state.hands[afkId];
              const randomCard = hand[Math.floor(Math.random() * hand.length)];

              const action: GameAction = {
                type: 'SUBMIT_CARD',
                playerId: afkId,
                payload: { cardId: randomCard },
              };
              const emissions = await gameService.handleAction(lobbyCode, action);
              dispatchEmissions(io, emissions);
            }
            break;
          }

          case 'VOTING': {
            // Buscamos quién no ha votado
            const votedPlayers =
              state.currentRound.votes?.map((v: any) => v.voterId) || [];
            const afkPlayers = state.players.filter(
              (pId: string) =>
                pId !== state.currentRound.storytellerId &&
                !votedPlayers.includes(pId),
            );

            // Votamos aleatoriamente por ellos (que no sea su propia carta)
            for (const afkId of afkPlayers) {
              const myCard = state.currentRound.playedCards[afkId];
              const validOptions = state.currentRound.boardCards.filter(
                (cId: number) => cId !== myCard,
              );
              const randomVote =
                validOptions[Math.floor(Math.random() * validOptions.length)];

              const action: GameAction = {
                type: 'CAST_VOTE',
                playerId: afkId,
                payload: { cardId: randomVote },
              };
              const emissions = await gameService.handleAction(lobbyCode, action);
              dispatchEmissions(io, emissions);
            }
            break;
          }

          case 'SCORING': {
            // En SCORING no hay acción del jugador, simplemente avanzamos de ronda
            const action: GameAction = {
              type: 'NEXT_ROUND',
              playerId: 'SYSTEM',
            };
            const emissions = await gameService.handleAction(lobbyCode, action);
            dispatchEmissions(io, emissions);
            break;
          }
        }
      } catch (error: any) {
        console.error(`[Worker Error] ${lobbyCode}:`, error.message);
      }
    },
    {
      connection: bullmqConnection,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );

  gameWorker.on('failed', (job, err) => {
    console.error(`[Worker] Fallo en timer de ${job?.data.lobbyCode}:`, err);
  });

  console.log('Game Worker (BullMQ) inicializado y vigilando turnos AFK.');
};
