import dotenv from 'dotenv';
import path from 'path';
// Aseguramos cargar el .env de la raíz del proyecto
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';

import { prisma } from '../../infrastructure/prisma';
import { connectRedis, redisClient } from '../../infrastructure/redis';
import { GameRedisRepository } from '../../repositories/game.repository';
import { LobbyRedisRepository } from '../../repositories/lobby.repository';

const BACKEND_URL = 'http://localhost:3000';
const LOBBY_CODE = 'FLOW';
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_fallback_key';

describe('Full Flow Socket (E2E Test)', () => {
  let hostSocket: Socket;
  let player2Socket: Socket;

  let hostToken: string;
  let player2Token: string;
  let hostId: string;
  let player2Id: string;
  let p3Id: string;
  let p4Id: string;

  beforeAll(async () => {
    console.log('🔌 Conectando bases de datos...');
    await connectRedis();

    // 0. LIMPIEZA PREVIA PARA EVITAR FUGAS DE TESTS ANTERIORES
    await GameRedisRepository.deleteGame(LOBBY_CODE);
    await LobbyRedisRepository.remove(LOBBY_CODE);

    // 1. Buscar usuarios reales
    const usersWithDecks = await prisma.user.findMany({
      where: { my_deck: { some: {} } },
      select: { id_user: true, username: true },
      take: 2,
    });

    if (usersWithDecks.length < 2)
      throw new Error(
        'Se necesitan al menos 2 usuarios con mazos en la BD para probar.',
      );

    const otherUsers = await prisma.user.findMany({
      where: { id_user: { notIn: usersWithDecks.map((u) => u.id_user) } },
      select: { id_user: true, username: true },
      take: 2,
    });

    if (otherUsers.length < 2)
      throw new Error(
        'Se necesitan al menos 4 usuarios en total en la BD para probar.',
      );

    hostId = `u_${usersWithDecks[0].id_user}`;
    player2Id = `u_${usersWithDecks[1].id_user}`;
    p3Id = `u_${otherUsers[0].id_user}`;
    p4Id = `u_${otherUsers[1].id_user}`;
    console.log(
      `✅ Host: ${usersWithDecks[0].username} (${hostId}) | Jugador 2: ${usersWithDecks[1].username} (${player2Id})`,
    );

    // 2. Generar JWT para ambos
    hostToken = jwt.sign(
      {
        id: hostId,
        username: usersWithDecks[0].username,
        lobbyCode: LOBBY_CODE,
      },
      SECRET_KEY,
      { expiresIn: '5m' },
    );
    player2Token = jwt.sign(
      {
        id: player2Id,
        username: usersWithDecks[1].username,
        lobbyCode: LOBBY_CODE,
      },
      SECRET_KEY,
      { expiresIn: '5m' },
    );

    // 3. Crear el Lobby en Redis simulando que ya se unieron 3 personas (Falta 1 para empezar)
    const mockLobby = {
      hostId: hostId,
      name: 'Partida de Prueba Completa',
      maxPlayers: 6,
      engine: 'STANDARD',
      isPrivate: false,
      status: 'waiting',
      players: [hostId, p3Id, p4Id], // 3 Jugadores. El player2Id se unirá vía Socket para sumar 4
      lobbyCode: LOBBY_CODE,
    };

    await LobbyRedisRepository.save(LOBBY_CODE, mockLobby);
    console.log(
      `✅ Lobby ${LOBBY_CODE} inyectado vacío esperando al jugador clave.`,
    );
  });

  afterAll(async () => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (player2Socket && player2Socket.connected) player2Socket.disconnect();

    await prisma.$disconnect();
    if (redisClient.isOpen) await redisClient.disconnect();
  });

  it('debería ejecutar el flujo conectando dos Sockets, actualizar el lobby e iniciar partida', async () => {
    expect(hostToken).toBeDefined();

    console.log('\n🔄 Conectando Socket de Host...');
    hostSocket = io(BACKEND_URL, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });

    console.log('\n🔄 Conectando Socket de Jugador 2...');
    player2Socket = io(BACKEND_URL, {
      auth: { token: player2Token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            'Timeout esperando los eventos del websockets correspondientes (¿Servidor local backend apagado?)',
          ),
        );
      }, 7000); // Darle algo de margen extra

      // ============================================
      // COMPORTAMIENTO JUGADOR 2
      // ============================================
      player2Socket.on('connect', () => {
        console.log(
          '✅ [P2] Socket conectado al servidor! ID:',
          player2Socket.id,
        );
      });

      player2Socket.on('server:session:recovered', (payload) => {
        console.log(
          '⚠️ [P2] Recibido session:recovered en lugar de lobby:recovered! Estado:',
          payload.state?.phase,
        );
      });

      player2Socket.on('server:lobby:recovered', () => {
        console.log(
          `\n✅ [P2] Jugador 2 recuperó la sala. Emitiendo evento 'client:lobby:join' para hacerse ver...`,
        );
        // OBLIGATORIO: Esto inyecta a player2Id en Redis (si no estaba) y hace broadcast a todos
        player2Socket.emit('client:lobby:join');
      });

      player2Socket.on('server:error', (err) =>
        reject(new Error(`P2 Error del servidor: ${err.message}`)),
      );
      player2Socket.on('connect_error', (err) =>
        reject(new Error(`P2 Error de conexión: ${err.message}`)),
      );

      // ============================================
      // COMPORTAMIENTO HOST
      // ============================================
      let gameStartedReceived = false;
      let serverGameStartedReceived = false;
      let privateHandReceived = false;

      const checkDone = () => {
        if (
          gameStartedReceived &&
          serverGameStartedReceived &&
          privateHandReceived
        ) {
          console.log(
            '\n🎉 ¡VERIFICACIÓN DE UPDATE EN LOBBY Y FLUJO COMPLETO FINALIZADA CON ÉXITO! 🎉',
          );
          clearTimeout(timeout);
          resolve();
        }
      };

      // ✨ MAGIA: El host recibe este evento con la nueva lista GRACIAS a que el jugador 2 hizo emit('join')
      hostSocket.on('server:lobby:state_updated', (lobbyState) => {
        console.log(
          `\n✅ [LOBBY ACTUALIZADO] El Host recibió cambios en la sala. Jugadores conectados: ${lobbyState.players.length}`,
        );

        // Puede llegar un evento inicial/residual por el disconnect de test anteriores
        if (!lobbyState.players.includes(player2Id)) {
          console.log('Ignorando evento residual sin el Jugador 2...');
          return;
        }

        expect(lobbyState.players).toContain(player2Id); // Validar que sí se actualizan los que entran

        if (lobbyState.players.length >= 4 && lobbyState.hostId === hostId) {
          console.log(
            `\n🚀 Host constata 4+ jugadores y pulsa "Empezar Partida" (client:lobby:start)...`,
          );
          hostSocket.emit('client:lobby:start');
        }
      });

      hostSocket.on('game:started', () => {
        console.log(
          '\n✅ [EVENTO RECIBIDO]: game:started (Navegar al tablero)',
        );
        gameStartedReceived = true;
        checkDone();
      });

      hostSocket.on('server:game:started', (payload: any) => {
        console.log('\n✅ [ESTADO DEL JUEGO RECIBIDO]');
        expect(payload).toBeDefined();
        serverGameStartedReceived = true;
        checkDone();
      });

      hostSocket.on('server:game:private_hand', (payload: any) => {
        console.log('\n🃏 [MANO PRIVADA RECIBIDA]');
        expect(Array.isArray(payload.hand)).toBe(true);
        privateHandReceived = true;
        checkDone();
      });

      hostSocket.on('server:error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Host Error del servidor recibido: ${err.message}`));
      });

      hostSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Host Error de conexión: ${err.message}. Verifica 'npm run dev'.`,
          ),
        );
      });
    });
  }, 10000);

  it('debería simular el fin de partida, verificar ranking y reparto de monedas', async () => {
    console.log('\n🔄 Simulando finalización de partida con puntuaciones...');

    // 1. Obtener monedas iniciales de los usuarios
    const numericIds = [hostId, player2Id, p3Id, p4Id].map((id) =>
      parseInt(id.replace('u_', '')),
    );
    const initialUsers = await prisma.user.findMany({
      where: { id_user: { in: numericIds } },
      select: { id_user: true, coins: true },
    });
    const initialCoins: Record<string, number> = {};
    initialUsers.forEach((u) => {
      initialCoins[`u_${u.id_user}`] = u.coins || 0;
    });

    // 2. Manipular estado de Redis con puntuaciones definidas
    const gameId = LOBBY_CODE;
    const currentState = await GameRedisRepository.getGame(gameId);
    expect(currentState).toBeDefined();

    if (currentState) {
      // Establecer puntuaciones de 1º a 4º (Host 1º, P2 2º, P3 3º, P4 4º)
      currentState.scores[hostId] = 40;
      currentState.scores[player2Id] = 30;
      currentState.scores[p3Id] = 20;
      currentState.scores[p4Id] = 10;
      await GameRedisRepository.saveGame(gameId, currentState);
    }

    // 3. Emitir y esperar eventos
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timeout esperando eventos de fin de juego')),
        5000,
      );

      let gameEndedReceived = false;
      let walletUpdatedHost = false;
      let walletUpdatedP2 = false;

      const checkDone = () => {
        if (gameEndedReceived && walletUpdatedHost && walletUpdatedP2) {
          clearTimeout(timeout);
          resolve();
        }
      };

      // Nos suscribimos desde host a la tabla final
      hostSocket.on('server:game:ended', (payload: any) => {
        console.log(
          '🏁 [HOST] Partida finalizada recibida. Ranking comprobado.',
        );
        expect(payload.ranking.length).toBe(4);
        expect(payload.ranking[0].playerId).toBe(hostId); // 1er lugar
        expect(payload.ranking[0].coinsEarned).toBe(50);
        expect(payload.ranking[1].playerId).toBe(player2Id); // 2o lugar
        expect(payload.ranking[1].coinsEarned).toBe(35);
        expect(payload.ranking[2].playerId).toBe(p3Id); // 3er lugar
        expect(payload.ranking[2].coinsEarned).toBe(25);
        expect(payload.ranking[3].playerId).toBe(p4Id); // 4o lugar
        expect(payload.ranking[3].coinsEarned).toBe(15);
        gameEndedReceived = true;
        checkDone();
      });

      // Wallet de Host
      hostSocket.on('server:economy:wallet_updated', (payload: any) => {
        console.log(`💰 [HOST] Wallet update recibido: ${payload.balance}`);
        const expectedCoins = initialCoins[hostId] + 50;
        expect(payload.balance).toBe(expectedCoins);
        walletUpdatedHost = true;
        checkDone();
      });

      // Wallet de Jugador 2
      player2Socket.on('server:economy:wallet_updated', (payload: any) => {
        console.log(`💰 [P2] Wallet update recibido: ${payload.balance}`);
        const expectedCoins = initialCoins[player2Id] + 35;
        expect(payload.balance).toBe(expectedCoins);
        walletUpdatedP2 = true;
        checkDone();
      });

      // Disparamos el fin de partida
      console.log('🚀 [HOST] Enviando client:game:end...');
      hostSocket.emit('client:game:end', { lobbyCode: LOBBY_CODE });
    });

    // 4. Validar que la BD persistió correctamente
    const finalUsers = await prisma.user.findMany({
      where: { id_user: { in: numericIds } },
      select: { id_user: true, coins: true },
    });

    const hostFinal = finalUsers.find((u) => u.id_user === numericIds[0]);
    const p2Final = finalUsers.find((u) => u.id_user === numericIds[1]);
    expect(hostFinal?.coins).toBe(initialCoins[hostId] + 50);
    expect(p2Final?.coins).toBe(initialCoins[player2Id] + 35);
    console.log(
      '✅ Base de datos validada con éxito tras finalizar la partida.',
    );
  }, 10000);
});
