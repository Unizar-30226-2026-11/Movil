import dotenv from 'dotenv';
import path from 'path';
// Aseguramos cargar el .env de la raíz del proyecto
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';

import { prisma } from '../../infrastructure/prisma';
import { connectRedis, redisClient } from '../../infrastructure/redis';
import { LobbyRedisRepository } from '../../repositories/lobby.repository';

// ==========================================
// CONFIGURACIÓN
// ==========================================
const BACKEND_URL = 'http://localhost:3000'; // El puerto donde corre tu backend
const LOBBY_CODE = 'CHAT'; // Sala de prueba automatizada
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_fallback_key';

describe('Chat Socket (E2E Test)', () => {
  let socket: Socket;
  let wsToken: string;
  let hostId: string;
  let hostUsername: string;

  beforeAll(async () => {
    console.log('🔌 Conectando bases de datos para Test de Chat...');
    await connectRedis();

    // 1. Buscar un usuario real en la base de datos
    const user = await prisma.user.findFirst({
      select: { id_user: true, username: true },
    });

    if (!user) throw new Error('No hay usuarios en la BD para probar.');

    hostId = `u_${user.id_user}`;
    hostUsername = user.username;
    console.log(`✅ Usuario Host encontrado: ${hostUsername} (${hostId})`);

    // 2. Generar un JWT válido dinámicamente para el test
    wsToken = jwt.sign(
      { id: hostId, username: hostUsername, lobbyCode: LOBBY_CODE },
      SECRET_KEY,
      { expiresIn: '5m' },
    );

    // 3. Crear el Lobby en Redis simulando que existe para que se puedan unir a la sala del chat
    const mockLobby = {
      hostId: hostId,
      name: 'Partida de Prueba de Chat',
      maxPlayers: 6,
      engine: 'STANDARD',
      isPrivate: false,
      status: 'waiting',
      players: [hostId],
    };

    await LobbyRedisRepository.save(LOBBY_CODE, {
      ...mockLobby,
      lobbyCode: LOBBY_CODE,
    });
    console.log(`✅ Lobby ${LOBBY_CODE} inyectado en Redis.`);
  });

  afterAll(async () => {
    // Cerramos todo para evitar fugas de memoria o que Jest se quede colgado
    if (socket && socket.connected) {
      socket.disconnect();
    }
    await prisma.$disconnect();

    if (redisClient.isOpen) {
      await redisClient.disconnect();
    }
  });

  it('debería enviar y recibir un mensaje de chat a través del websocket', async () => {
    expect(wsToken).toBeDefined();

    console.log('\n🔄 Intentando conectar al servidor de Sockets...');
    socket = io(BACKEND_URL, {
      auth: { token: wsToken },
      transports: ['websocket'], // Forzamos WebSocket puro
    });

    // Promosificamos los eventos para que Jest espere a que acabe el ciclo de envío y recepción
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            'Timeout esperando el mensaje. Asegúrate de tener el servidor con npm run dev corriendo.',
          ),
        );
      }, 5000);

      socket.on('connect', () => {
        console.log(`✅ Conectado al servidor con ID: ${socket.id}`);
        // Simulamos que el cliente entra a la sala de sockets (si usa joinLobbyRoom)
        socket.emit('joinLobbyRoom', LOBBY_CODE);
      });

      // ¡Aquí está la magia! No usamos setTimeout ciego. Sincronizamos cuando el backend nos
      // dice que ha cargado todo el estado inicial y sabemos que sus handlers están listos.
      socket.on('server:lobby:recovered', () => {
        console.log(
          `\n✅ Sala de espera recuperada. Mandando mensaje a ${LOBBY_CODE}...`,
        );
        socket.emit('client:chat:send', {
          lobbyCode: LOBBY_CODE,
          text: '¡Hola! Este es un mensaje de prueba desde el script de Jest.',
        });
      });

      // Escuchamos los mensajes entrantes (lo que haría el frontend para pintar el chat)
      socket.on('server:chat:message_received', (payload: any) => {
        console.log('\n[NUEVO MENSAJE RECIBIDO]');
        console.log(`Usuario: ${payload.username}`);
        console.log(`Texto:   ${payload.text}`);
        console.log(`Hora:    ${payload.timestamp}`);

        // Las validaciones de que vino lo correcto
        expect(payload).toBeDefined();
        expect(payload.text).toBe(
          '¡Hola! Este es un mensaje de prueba desde el script de Jest.',
        );
        expect(payload.timestamp).toBeDefined();

        console.log('\n✅ Test finalizado con éxito.');
        clearTimeout(timeout);
        resolve(); // Termina la promesa correctamente para que Jest de el PASS
      });

      // Escuchamos errores (muy importante por si falla la validación Zod u otros)
      socket.on('server:error', (error: any) => {
        clearTimeout(timeout);
        reject(new Error(`[ERROR DEL SERVIDOR]: ${error.message}`));
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `[ERROR DE CONEXIÓN]: ${err.message}\nAsegúrate de que el servidor está encendido.`,
          ),
        );
      });
    });
  }, 10000); // 10 segundos máximo para todo el bloque it()
});
