// services/friend.service.ts

import { Friendship_States } from '@prisma/client';

import { prisma } from '../infrastructure/prisma';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';
import { getCachedData, invalidateCache } from '../shared/utils/cache.utils';

export const FriendService = {
  // Obtener lista de amigos de un usuario
  getConfirmedFriends: async (u_id: string) => {
    return getCachedData(`cache:friends:confirmed:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

      const friendships = await prisma.friendships.findMany({
        where: {
          state: Friendship_States.FRIEND,
          OR: [{ id_user_1: id_user }, { id_user_2: id_user }],
        },
        include: {
          user_1: true,
          user_2: true,
        },
      });

      return friendships.map((friendship) => {
        const friend =
          friendship.id_user_1 === id_user
            ? friendship.user_2
            : friendship.user_1;

        return {
          id: `${ID_PREFIXES.USER}${friend.id_user}`,
          username: friend.username,
          status: friend.state,
        };
      });
    });
  },

  // Obtener solicitudes enviadas hacia el usuario (pendientes de aceptar)
  getPendingRequests: async (u_id: string) => {
    return getCachedData(`cache:friends:pending:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

      const pending = await prisma.friendships.findMany({
        where: {
          id_user_2: id_user,
          state: Friendship_States.PENDING,
        },
      });

      return pending.map((friendship) => ({
        id: `${ID_PREFIXES.REQ}${friendship.id_user_1}_${friendship.id_user_2}`,
        fromUserId: `${ID_PREFIXES.USER}${friendship.id_user_1}`,
        toUserId: `${ID_PREFIXES.USER}${friendship.id_user_2}`,
        createdAt: friendship.beggining_date,
      }));
    });
  },

  // Comprobar la relacion entre dos usuarios. Devuelve un enum de Friendship_States.
  checkRelationshipStatus: async (u_id: string, target_u_id: string) => {
    const id_user_1 = parseInt(u_id.replace(ID_PREFIXES.USER, ''));
    const id_user_2 = parseInt(target_u_id.replace(ID_PREFIXES.USER, ''));

    const friendship = await prisma.friendships.findFirst({
      where: {
        OR: [
          { id_user_1: id_user_1, id_user_2: id_user_2 },
          { id_user_2: id_user_2, id_user_1: id_user_1 },
        ],
      },
    });

    if (!friendship) return null;

    return friendship.state;
  },

  // Crea una peticion de amistad pendiente del 1er al 2o usuario
  createFriendRequest: async (from_u_id: string, to_u_id: string) => {
    const id_from_u = parseInt(from_u_id.replace(ID_PREFIXES.USER, ''));
    const id_to_u = parseInt(to_u_id.replace(ID_PREFIXES.USER, ''));

    const newFriendship = await prisma.friendships.create({
      data: {
        id_user_1: id_from_u,
        id_user_2: id_to_u,
        state: Friendship_States.PENDING,
      },
    });

    if (newFriendship == null) {
      return null;
    }

    // Invalidar la caché de pendientes del receptor
    await invalidateCache(`cache:friends:pending:${to_u_id}`);

    return {
      id: `${ID_PREFIXES.REQ}${newFriendship.id_user_1}_${newFriendship.id_user_2}`,
      fromUserId: `${ID_PREFIXES.USER}${newFriendship.id_user_1}`,
      toUserId: `${ID_PREFIXES.USER}${newFriendship.id_user_2}`,
    };
  },

  // Busca una o varias solicitudes a partir de su id compuesto req_(id_usuario_1)_(id_usuario_2)
  findRequestById: async (req_id: string | string[]) => {
    const isArray = Array.isArray(req_id);
    const ids = isArray ? req_id : [req_id];

    const validConditions = ids.reduce((acc: any[], currentId: string) => {
      const parts = currentId.replace(ID_PREFIXES.REQ, '').split('_');

      if (parts.length === 2) {
        acc.push({
          id_user_1: parseInt(parts[0]),
          id_user_2: parseInt(parts[1]),
        });
      }
      return acc;
    }, []);

    if (validConditions.length === 0 || validConditions === null) return null;

    const requests = await prisma.friendships.findMany({
      where: {
        OR: validConditions,
      },
      include: {
        user_1: true,
        user_2: true,
      },
    });

    const formattedRequests = requests.map((request) => ({
      id: `${ID_PREFIXES.REQ}${request.id_user_1}_${request.id_user_2}`,
      fromUserId: `${ID_PREFIXES.USER}${request.id_user_1}`,
      toUserId: `${ID_PREFIXES.USER}${request.id_user_2}`,
      status: request.state,
      createdAt: request.beggining_date,
    }));

    return formattedRequests;
  },

  // Acepta una o varias solicitudes a partir de su id compuesto req_(id_usuario_1)_(id_usuario_2)
  acceptFriendRequest: async (req_id: string | string[]) => {
    const ids = Array.isArray(req_id) ? req_id : [req_id];

    const validRequests = ids.reduce((acc: any[], currentId: string) => {
      const parts = currentId.replace(ID_PREFIXES.REQ, '').split('_');

      if (parts.length === 2) {
        acc.push({
          id_user_1: parseInt(parts[0]),
          id_user_2: parseInt(parts[1]),
        });
      }
      return acc;
    }, []);

    if (validRequests.length === 0 || validRequests === null) return false;

    const result = await prisma.friendships.updateMany({
      where: {
        OR: validRequests,
      },
      data: { state: Friendship_States.FRIEND },
    });

    if (result.count > 0) {
      for (const request of validRequests) {
        // Borramos la caché de amigos de ambos
        await invalidateCache(
          `cache:friends:confirmed:${ID_PREFIXES.USER}${request.id_user_1}`,
        );
        await invalidateCache(
          `cache:friends:confirmed:${ID_PREFIXES.USER}${request.id_user_2}`,
        );
        // Borramos la caché de pendientes del que la recibió
        await invalidateCache(
          `cache:friends:pending:${ID_PREFIXES.USER}${request.id_user_2}`,
        );
      }
    }

    return result.count > 0;
  },

  removeFriend: async (u_id: string, f_id: string | string[]) => {
    const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));
    const f_ids_array = Array.isArray(f_id) ? f_id : [f_id];

    const friend_ids = f_ids_array.map((id) =>
      parseInt(id.replace(ID_PREFIXES.USER, '')),
    );

    if (friend_ids.length === 0) return false;

    const result = await prisma.friendships.deleteMany({
      where: {
        OR: [
          { id_user_1: id_user, id_user_2: { in: friend_ids } },
          { id_user_1: { in: friend_ids }, id_user_2: id_user },
        ],
      },
    });

    // Invalidar la caché de amigos de ambos
    if (result.count > 0) {
      await invalidateCache(`cache:friends:confirmed:${u_id}`);
      for (const id of friend_ids) {
        await invalidateCache(
          `cache:friends:confirmed:${ID_PREFIXES.USER}${id}`,
        );
      }
    }

    return result.count > 0;
  },

  // Rechaza una o varias solicitudes a partir de su id compuesto req_(id_usuario_1)_(id_usuario_2)
  rejectFriendRequest: async (req_id: string | string[]) => {
    const ids = Array.isArray(req_id) ? req_id : [req_id];

    const validConditions = ids.reduce((acc: any[], currentId: string) => {
      const parts = currentId.replace(ID_PREFIXES.REQ, '').split('_');

      if (parts.length === 2) {
        acc.push({
          id_user_1: parseInt(parts[0]),
          id_user_2: parseInt(parts[1]),
        });
      }
      return acc;
    }, []);

    if (validConditions.length === 0 || validConditions === null) return false;

    const result = await prisma.friendships.deleteMany({
      where: {
        OR: validConditions,
      },
    });

    // 6. Invalidar la caché de pendientes del receptor
    if (result.count > 0) {
      for (const cond of validConditions) {
        await invalidateCache(
          `cache:friends:pending:${ID_PREFIXES.USER}${cond.id_user_2}`,
        );
      }
    }

    return result.count > 0;
  },
};
