import { Server, Socket } from 'socket.io';

import { GameRedisRepository } from '../../repositories/game.repository';
import { LobbyRedisRepository } from '../../repositories/lobby.repository';
import { LobbyService } from '../../services/lobby.service';
import { SERVER_EVENTS } from '../events';
import {
  AuthenticatedSocket,
  authenticateSocket,
} from '../middleware/socket-auth.middleware';
import { registerChatHandlers } from './chat.handler';
import { registerGameHandlers } from './game.handlers';
import { registerLobbyHandlers } from './lobby.handler';

const connectedUsers = new Map<string, Socket>();

export const setupSockets = (io: Server) => {
  io.use(authenticateSocket);

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.user?.id;
    const lobbyCode = socket.data?.lobbyCode;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    console.log(
      `Socket conectado: ${socket.id} (Usuario: ${socket.user?.username})`,
    );

    // 1. CONTROL MULTITAB: Echar a la pestaña anterior
    if (connectedUsers.has(userId)) {
      const oldSocket = connectedUsers.get(userId);
      if (oldSocket && oldSocket.id !== socket.id) {
        oldSocket.emit(SERVER_EVENTS.FORCE_DISCONNECT, {
          message:
            'Has abierto el juego en otra pestaña. Desconectando sesión anterior.',
        });
        oldSocket.disconnect(true);
      }
    }
    connectedUsers.set(userId, socket);

    // Unir a sala personal
    socket.join(userId);

    // 2. LÓGICA DE AUTO-RECONEXIÓN AL INICIAR
    if (lobbyCode) {
      // Le unimos a la sala automáticamente sin esperar a que el Frontend haga emit('join')
      socket.join(lobbyCode);
      console.log(
        `${socket.user?.username} auto-reconectado a la sala: ${lobbyCode}`,
      );

      try {
        // Buscamos si la partida ya ha empezado
        const gameState = await GameRedisRepository.getGame(lobbyCode);

        if (gameState) {
          // Está jugando, le enviamos el tablero

          //Eliminamos información privada primero
          const publicState = structuredClone(gameState);
          delete (publicState as any).centralDeck;
          delete (publicState as any).hands;
          socket.emit(SERVER_EVENTS.SESSION_RECOVERED, {
            lobbyCode,
            state: publicState,
          });
        } else {
          // No hay partida, pero hay lobbyCode, así que está en la sala de espera
          // El disconnect previo habrá borrado al jugador de Redis (leaveLobby),
          // así que lo volvemos a insertar antes de emitir el estado a todos.
          const updatedLobby = await LobbyService.joinLobby(
            lobbyCode,
            userId,
          ).catch(() => LobbyRedisRepository.findByCode(lobbyCode));

          if (updatedLobby) {
            // 1. Informamos al propio socket de su recuperación con el estado actualizado
            socket.emit(SERVER_EVENTS.LOBBY_RECOVERED, {
              lobbyCode,
              lobby: updatedLobby,
            });

            // 2. Notificamos al RESTO de usuarios que el jugador se ha reconectado
            socket.to(lobbyCode).emit(SERVER_EVENTS.LOBBY_PLAYER_RECONNECTED, {
              user: socket.user?.username,
              message: `${socket.user?.username} se ha reconectado a la sala.`,
            });

            // 3. Emitimos el estado COMPLETO (con el jugador incluido) a TODOS
            io.to(lobbyCode).emit(
              SERVER_EVENTS.LOBBY_STATE_UPDATED,
              updatedLobby,
            );
          }
        }
      } catch (error) {
        console.error('Error al recuperar sesión:', error);
      }
    }

    // El evento explícito por si vienen de una navegación normal
    socket.on('joinLobbyRoom', (code: string) => {
      socket.join(code);
    });

    // Registramos handlers
    registerChatHandlers(io, socket);
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);

    // 3. GESTIÓN DE DESCONEXIÓN
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
      // Borramos el socket del mapa en memoria, pero NO de Redis.
      // Si hacen F5, Redis sigue teniendo su partida y se reconectarán en el siguiente ciclo.
      if (connectedUsers.get(userId)?.id === socket.id) {
        connectedUsers.delete(userId);
      }
    });
  });
};
