// src/infrastructure/bullmq/scheduler.ts
import { Queue } from 'bullmq';

import { bullmqConnection } from '../redis';

// Creamos la cola específica para eventos globales
export const eventQueue = new Queue('game-events', {
  connection: bullmqConnection,
});

export const initializeScheduler = async () => {
  console.log('⏳ Inicializando Scheduler de eventos globales...');

  // Añadimos el job recurrente.
  // OJO: Si reinicias el server muchas veces, BullMQ no duplicará el job
  // si el ID (o el nombre y opciones) es el mismo.
  await eventQueue.add(
    'check-random-events',
    {}, // No necesitamos pasarle datos (payload vacío)
    {
      repeat: {
        every: 30000, // Se ejecuta cada 30 segundos exactos
      },
      jobId: 'global-star-event-trigger', // Le damos un ID fijo para evitar duplicados
    },
  );
};
