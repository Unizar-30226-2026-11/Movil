// controllers/lobby.controller.ts
import { Response } from 'express';

import { AuthService, LobbyService } from '../../services';
import { AuthenticatedRequest } from '../../shared/types';

export const createLobby = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const hostId = req.user!.id;
    const { name, maxPlayers, engine, isPrivate } = req.body;

    // Llamada al servicio para crear la sala
    const createdLobby = await LobbyService.create({
      hostId,
      name,
      maxPlayers,
      engine,
      isPrivate,
    });

    res.status(201).json({
      message: 'Sala creada exitosamente. Listo para conexión WebSocket.',
      lobby: createdLobby,
    });
  } catch (error) {
    console.error('Error in createLobby:', error);
    res.status(500).json({ message: 'Error interno al crear la sala.' });
  }
};

export const getPublicLobbies = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const searchQuery = req.query.search as string | undefined;

    // Búsqueda delegada al servicio
    const publicLobbies = await LobbyService.getPublicLobbies(searchQuery);

    // Retornar la lista
    res.status(200).json({
      lobbies: publicLobbies,
    });
  } catch (error) {
    console.error('Error in getPublicLobbies:', error);
    res.status(500).json({ message: 'Error al buscar salas públicas.' });
  }
};

export const getLobbyByCode = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const { lobbyCode } = req.params as { lobbyCode: string };

    const lobby = await LobbyService.getLobbyByCode(lobbyCode);

    // Validaciones de negocio en el controlador (o podrían ir al servicio)
    if (!lobby) {
      res
        .status(404)
        .json({ message: 'La sala solicitada no existe o ya ha terminado.' });
      return;
    }

    // Retornar los detalles para permitir la conexión en el frontend
    res.status(200).json({
      message: 'Sala encontrada.',
      lobby,
    });
  } catch (error) {
    console.error('Error in getLobbyByCode:', error);
    res
      .status(500)
      .json({ message: 'Error al buscar la información de la sala.' });
  }
};

export const joinLobby = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { lobbyCode } = req.params as { lobbyCode: string };

    // 1. Obtener la sala para validar que existe
    const lobby = await LobbyService.getLobbyByCode(lobbyCode);

    if (!lobby) {
      res
        .status(404)
        .json({ message: 'La sala solicitada no existe o ya ha terminado.' });
      return;
    }

    // 2. Verificar si la sala ya está llena
    const isAlreadyInLobby = lobby.players.includes(userId);

    if (lobby.players.length >= lobby.maxPlayers && !isAlreadyInLobby) {
      res.status(403).json({
        message: 'La sala está llena. No se pueden unir más jugadores.',
      });
      return;
    }

    await AuthService.saveUserSession(userId, lobbyCode);

    // 3. Generar el token de conexión para el WebSocket
    const wsToken = await AuthService.generateLobbyToken(
      userId,
      req.user!.username,
      lobbyCode,
    );

    // 4. Retornar el token al cliente
    res.status(200).json({
      message: 'Ticket de conexión WebSocket generado exitosamente.',
      wsToken,
      lobbyCode,
    });
  } catch (error) {
    console.error('Error in joinLobby:', error);
    res
      .status(500)
      .json({ message: 'Error interno al solicitar unirse a la sala.' });
  }
};
