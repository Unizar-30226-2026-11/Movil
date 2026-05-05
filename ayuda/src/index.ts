import 'dotenv/config';

import { createServer } from 'http'; // Para crear el servidor HTTP necesario para Socket.io
import { Server } from 'socket.io'; // Para manejar WebSockets

import app from './app';
import { prisma } from './infrastructure/prisma';
import { connectRedis, redisClient } from './infrastructure/redis';
import { initRedisIndices } from './infrastructure/redis/index';
import { setupSockets } from './sockets/handlers'; // Para configurar los handlers de Socket.io
import { initializeGameWorker } from './workers/game.worker';
const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    // Conectar Prisma
    await prisma.$connect();
    console.log('✅ Base de datos (Prisma) lista.');

    // Conectar Redis
    await connectRedis();
    // Inicializar índices de Redis OM
    await initRedisIndices();

    //Creamos el servidor HTTP envolviendo la app de Express
    const httpServer = createServer(app);

    //Inicializamos Socket.io sobre ese servidor HTTP
    const io = new Server(httpServer, {
      cors: {
        origin: '*', // Ajusta esto a la URL de tu frontend más adelante
        methods: ['GET', 'POST'],
      },
    });

    //Levantamos nuestra lógica de sockets
    setupSockets(io);

    //Inicializamos el Worker que vigilará los tiempos muertos
    initializeGameWorker(io);
    // Ahora httpServer (Express + Socket.IO) hace el listen, no app aislada
    httpServer.listen(PORT, () => {
      console.log(
        `🚀 Servidor (HTTP + WebSockets) en http://localhost:${PORT}`,
      );
    });

    /* Arrancar Express
    app.listen(PORT, () => {
      console.log(`🚀 Servidor en http://localhost:${PORT}`);
    });*/
  } catch (error) {
    console.error('❌ Error crítico en el arranque:', error);
    await prisma.$disconnect();
    if (redisClient.isOpen) await redisClient.disconnect();
    process.exit(1);
  }
}

bootstrap();
