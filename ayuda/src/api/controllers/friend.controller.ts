// controllers/friend.controller.ts
import { Friendship_States } from '@prisma/client';
import { Response } from 'express';

import { FriendService } from '../../services';
import { AuthenticatedRequest } from '../../shared/types';

export const getFriends = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Obtener la lista de amigos confirmados
    const friends = await FriendService.getConfirmedFriends(userId);

    res.status(200).json({ friends });
  } catch (error) {
    console.error('Error in getFriends:', error);
    res.status(500).json({ message: 'Error al obtener la lista de amigos.' });
  }
};

export const getPendingRequests = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Obtener solicitudes entrantes pendientes
    const pendingRequests = await FriendService.getPendingRequests(userId);

    res.status(200).json({ pendingRequests });
  } catch (error) {
    console.error('Error in getPendingRequests:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener las solicitudes pendientes.' });
  }
};

export const sendRequest = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { targetUserId } = req.body;

    // Evitar que el usuario se envíe una solicitud a sí mismo
    if (userId === targetUserId) {
      res.status(400).json({
        message: 'No puedes enviarte una solicitud de amistad a ti mismo.',
      });
      return;
    }

    // Comprobar si ya son amigos o si ya existe una solicitud pendiente
    const relationshipStatus = await FriendService.checkRelationshipStatus(
      userId,
      targetUserId,
    );

    if (relationshipStatus === Friendship_States.FRIEND) {
      res
        .status(400)
        .json({ message: 'Este usuario ya está en tu lista de amigos.' });
      return;
    }

    if (relationshipStatus === Friendship_States.PENDING) {
      res.status(400).json({
        message:
          'Ya existe una solicitud de amistad pendiente con este usuario.',
      });
      return;
    }

    // Crear y guardar la solicitud en la base de datos
    const newRequest = await FriendService.createFriendRequest(
      userId,
      targetUserId,
    );

    res.status(201).json({
      message: 'Solicitud de amistad enviada con éxito.',
      request: newRequest,
    });
  } catch (error) {
    console.error('Error in sendRequest:', error);
    res
      .status(500)
      .json({ message: 'Error al enviar la solicitud de amistad.' });
  }
};

export const respondToRequest = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { requestId } = req.params;
    const { action } = req.body;

    // Buscar la solicitud en la base de datos
    const request = await FriendService.findRequestById(requestId);

    if (!request) {
      res.status(404).json({ message: 'La solicitud de amistad no existe.' });
      return;
    }

    // Verificar que la solicitud pertenece al usuario autenticado (él es el receptor)
    if (request[0].toUserId !== userId) {
      res.status(403).json({
        message: 'No tienes permiso para responder a esta solicitud.',
      });
      return;
    }

    // Procesar la acción (Aceptar o Rechazar)
    if (action === 'accept') {
      // Toda la lógica de negocio (cambiar estado y crear amistad) ocurre dentro del servicio
      await FriendService.acceptFriendRequest(requestId);
      res
        .status(200)
        .json({ message: 'Solicitud de amistad aceptada. Ahora son amigos.' });
      return;
    }

    if (action === 'reject') {
      await FriendService.rejectFriendRequest(requestId);
      res.status(200).json({ message: 'Solicitud de amistad rechazada.' });
      return;
    }
  } catch (error) {
    console.error('Error in respondToRequest:', error);
    res
      .status(500)
      .json({ message: 'Error al procesar la respuesta a la solicitud.' });
  }
};

export const removeFriend = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { friendId } = req.params;

    // Eliminar la relación bidireccional de amistad en la base de datos
    const success = await FriendService.removeFriend(userId, friendId);

    if (!success) {
      res.status(400).json({
        message:
          'No se pudo eliminar al amigo. Es posible que no estén en tu lista.',
      });
      return;
    }

    res
      .status(200)
      .json({ message: 'Amigo eliminado correctamente de tu lista.' });
  } catch (error) {
    console.error('Error in removeFriend:', error);
    res.status(500).json({ message: 'Error al eliminar al amigo.' });
  }
};
