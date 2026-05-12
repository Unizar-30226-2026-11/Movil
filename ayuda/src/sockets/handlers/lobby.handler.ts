// src/sockets/lobby.handler.ts
import { Server } from 'socket.io';

import { GameRedisRepository } from '../../repositories/game.repository';
import { GameService } from '../../services/game.service';
import { LobbyService } from '../../services/lobby.service';
import { LOBBY_MIN_PLAYERS } from '../../shared/constants';
import { CLIENT_EVENTS, SERVER_EVENTS, SOCKET_EVENTS } from '../events';
import { LobbyStartPayload } from '../events/types';
import { AuthenticatedSocket } from '../middleware/socket-auth.middleware';

export const registerLobbyHandlers = (
  io: Server,
  socket: AuthenticatedSocket,
) => {
  // Extraemos los datos 100% confiables del middleware
  const lobbyCode = socket.data.lobbyCode;
  const userId = socket.user?.id;

  if (!lobbyCode || !userId) return; // Salvaguarda

  // 1. UNIRSE AL LOBBY
  socket.on(CLIENT_EVENTS.LOBBY_JOIN, async () => {
    try {
      // Intentamos meter al jugador en Redis
      const updatedLobby = await LobbyService.joinLobby(lobbyCode, userId);

      // Le unimos a la sala de Socket.io (Room)
      socket.join(lobbyCode);
      console.log(
        `[Lobby] ${socket.user?.username} ha entrado al lobby ${lobbyCode}`,
      );

      // Informar al resto de usuarios que este usuario se unió
      socket.to(lobbyCode).emit(SOCKET_EVENTS.LOBBY_PLAYER_JOINED, {
        user: socket.user?.username,
        message: `${socket.user?.username} se ha unido a la sala.`,
      });

      // Emitimos el nuevo estado a TODOS en la sala para que actualicen sus pantallas
      io.to(lobbyCode).emit(SERVER_EVENTS.LOBBY_STATE_UPDATED, updatedLobby);
    } catch (error: any) {
      socket.emit(SERVER_EVENTS.ERROR, { message: error.message });
    }
  });

  // 2. INICIAR PARTIDA (Flujo Real sin Mocks)
  socket.on(CLIENT_EVENTS.LOBBY_START, async (payload?: LobbyStartPayload) => {
    try {
      const useDynamicPool = payload?.useDynamicPool ?? true;
      // Obtenemos la sala de Redis con todos los jugadores reales
      const lobby = await LobbyService.getLobbyByCode(lobbyCode);
      if (!lobby) throw new Error('La sala no existe o ha expirado.');

      // Validamos quién es el host
      if (lobby.hostId !== userId) {
        socket.emit(SERVER_EVENTS.ERROR, {
          message: 'Solo el líder puede empezar la partida.',
        });
        return;
      }

      // Validamos el cupo mínimo antes de llamar al motor (Ej. Dixit requiere 4)
      if (lobby.players.length < LOBBY_MIN_PLAYERS) {
        socket.emit(SERVER_EVENTS.ERROR, {
          message:
            'Se requieren al menos ${LOBBY_MIN_PLAYERS} jugadores para iniciar.',
        });
        return;
      }

      console.log(
        `[Lobby] Partida iniciada en el lobby ${lobbyCode} por el host ${userId}`,
      );

      //Pasamos los datos del lobby a la partida
      const gameService = new GameService(GameRedisRepository);
      const emissions = await gameService.initializeGame(lobbyCode, lobby, {
        useDynamicPool,
      });

      // Ejecutamos las emisiones devueltas por el service
      for (const { room, event, data } of emissions) {
        io.to(room).emit(event, data);
      }

      //Avisamos a los clientes para que cambien su pantalla al tablero de juego
      io.to(lobbyCode).emit(SOCKET_EVENTS.GAME_STARTED, { lobbyCode });
    } catch (error: any) {
      socket.emit(SERVER_EVENTS.ERROR, { message: error.message });
    }
  });

  // 3. DESCONEXIÓN (Intencional o inesperada)
  socket.on('disconnect', async () => {
    try {
      console.log(`[Lobby] ${socket.user?.username} se ha desconectado.`);

      // Sacamos al jugador de la sala en Redis
      await LobbyService.leaveLobby(lobbyCode, userId);

      // Informamos a los demás en la sala
      socket.to(lobbyCode).emit(SOCKET_EVENTS.LOBBY_PLAYER_LEFT, {
        user: socket.user?.username,
        message: `${socket.user?.username} se ha desconectado de la sala.`,
      });

      // Comprobamos si la sala sigue viva para avisar a los demás
      const remainingLobby = await LobbyService.getLobbyByCode(lobbyCode);
      if (remainingLobby) {
        io.to(lobbyCode).emit(
          SERVER_EVENTS.LOBBY_STATE_UPDATED,
          remainingLobby,
        );
      }
    } catch (error) {
      console.error(`Error procesando desconexión de ${userId}:`, error);
    }
  });

  //Cuando el usuario pulsa el botón de salir voluntariamente
  socket.on(CLIENT_EVENTS.LOBBY_LEAVE, async () => {
    try {
      console.log(
        `[Lobby] ${socket.user?.username} ha salido voluntariamente del lobby ${lobbyCode}`,
      );

      // 1. Lo sacamos de Redis
      await LobbyService.leaveLobby(lobbyCode, userId);

      // 2. Lo sacamos de la sala de Socket.io
      socket.leave(lobbyCode);

      // 3. Limpiamos su variable interna por si reutiliza el socket
      socket.data.lobbyCode = undefined;

      // Informamos a los demás en la sala
      socket.to(lobbyCode).emit(SOCKET_EVENTS.LOBBY_PLAYER_LEFT, {
        user: socket.user?.username,
        message: `${socket.user?.username} ha abandonado la sala.`,
      });

      // 4. Avisamos al resto de jugadores que quedan en la sala
      const remainingLobby = await LobbyService.getLobbyByCode(lobbyCode);
      if (remainingLobby) {
        io.to(lobbyCode).emit(
          SERVER_EVENTS.LOBBY_STATE_UPDATED,
          remainingLobby,
        );
      }
    } catch (error: any) {
      socket.emit(SERVER_EVENTS.ERROR, {
        message: 'Error al salir del lobby: ' + error.message,
      });
    }
  });
};
