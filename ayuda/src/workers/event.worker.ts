// src/workers/event.worker.ts
import { Job, Worker } from 'bullmq';
import { Server } from 'socket.io';

import { bullmqConnection } from '../infrastructure/redis';
import { GameRedisRepository } from '../repositories/game.repository';
import { GameService } from '../services/game.service';

export const initializeEventWorker = (io: Server) => {
  // Instanciamos el servicio como lo hace tu compañero
  const gameService = new GameService(GameRedisRepository);

  const eventWorker = new Worker(
    'game-events', // Escucha la misma cola que definimos en el Scheduler
    async (job: Job) => {
      if (job.name === 'check-random-events') {
        try {
          // 1. Obtenemos TODAS las salas activas actualmente en Redis
          // (Asegúrate de que este método exista en tu GameRedisRepository)
          const activeLobbies = await GameRedisRepository.getAllActiveLobbies();

          if (!activeLobbies || activeLobbies.length === 0) {
            return; // No hay partidas activas, no hacemos nada
          }

          // 2. Iteramos sobre cada sala para ver si le toca evento
          for (const lobbyCode of activeLobbies) {
            // Probabilidad aleatoria (RF-11) -> 15% de posibilidad
            if (Math.random() < 0.15) {
              console.log(
                `[EventWorker] 🌟 ¡Evento de estrella disparado para la sala ${lobbyCode}!`,
              );

              // 3. Llamamos al método de tu GameService
              // Asumimos que devuelve un Promise<SocketEmission[]>
              const emissions = await gameService.triggerStarEvent(lobbyCode);

              // 4. Procesamos y enviamos las emisiones por Sockets
              if (emissions && emissions.length > 0) {
                for (const { room, event, data } of emissions) {
                  io.to(room).emit(event, data);
                }
              }
            }
          }
        } catch (error: any) {
          console.error(
            '[EventWorker Error] Fallo al procesar eventos globales:',
            error.message,
          );
        }
      }
    },
    {
      connection: bullmqConnection,
      // Cambiamos true por un objeto que especifique cuántos queremos mantener
      removeOnComplete: { count: 0 }, // 0 si realmente no quieres nada de historial
      removeOnFail: { count: 10 },
    },
  );

  eventWorker.on('failed', (job, err) => {
    console.error(`[EventWorker] Error en el job ${job?.name}:`, err);
  });

  console.log(
    '☄️ Event Worker inicializado y escuchando la cola "game-events"',
  );
};
