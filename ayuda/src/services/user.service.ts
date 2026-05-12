import { User_States } from '@prisma/client';

import { prisma } from '../infrastructure/prisma';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';
import { getCachedData, invalidateCache } from '../shared/utils/cache.utils';

export const UserService = {
  // --- Perfil y Búsqueda ---
  getUserProfile: async (u_id: string) => {
    return getCachedData(`cache:user:profile:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));
      const user = await prisma.user.findUnique({
        where: { id_user },
        select: {
          id_user: true,
          username: true,
          email: true,
          exp_level: true,
          progress_level: true,
          state: true,
          personal_state: true,
          active_board_id: true,
          my_boards: {
            include: { board: true },
          },
        },
      });

      if (!user) return null;

      return {
        ...user,
        id: `${ID_PREFIXES.USER}${user.id_user}`,
        boards: user.my_boards.map((ub) => ({
          id: `${ID_PREFIXES.BOARD}${ub.board.id_board}`,
          name: ub.board.name,
          description: ub.board.description,
          price: ub.board.price,
          url_image: ub.board.url_image,
        })), // Formateo para el frontend
      };
    });
  },

  /**
   * Actualiza los datos básicos del perfil (Nombre de usuario).
   */
  updateUserProfile: async (u_id: string, username: string) => {
    // 1. Limpiar el prefijo 'u_' para obtener el ID numérico de la DB.
    // 2. Verificar si el 'username' ya está en uso por otro usuario (Unique constraint check).
    // 3. Si el nombre existe, lanzar una excepción controlada (ej: throw new Error('USERNAME_TAKEN')).
    // 4. Realizar el 'update' en la tabla 'user' mediante Prisma.
    // 5. Retornar el objeto del usuario actualizado o el perfil formateado.

    const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

    const user_username = await prisma.user.findUnique({
      where: { username },
    });

    if (user_username && user_username.id_user !== id_user) {
      throw new Error('USERNAME_TAKEN');
    }

    const updated_user = await prisma.user.update({
      where: { id_user },
      data: { username },
    });

    await invalidateCache(`cache:user:profile:${u_id}`); // Borramos la caché

    const { password, ...userWithoutPassword } = updated_user;

    return {
      ...userWithoutPassword,
      id: `${ID_PREFIXES.USER}${updated_user.id_user}`,
    };
  },

  /**
   * Gestiona el estado de visibilidad y presencia social.
   */
  updatePresence: async (u_id: string, status: string) => {
    // 1. Limpiar el prefijo 'u_' del ID.
    // 2. Validar que el 'status' pertenece al enum permitido (DISCONNECTED, CONNECTED, UNKNOWN, IN_GAME).
    // 3. Actualizar el campo de estado en la base de datos.
    // 4. LÓGICA DE PRIVACIDAD: Si el estado es 'INVISIBLE', el sistema debe marcar
    //    internamente que no se emitan eventos de WebSocket (como 'user_connected') a los amigos.
    // 5. Retornar el nuevo estado para confirmar la operación.

    const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

    if (!Object.values(User_States).includes(status as User_States)) {
      throw new Error('INVALID_STATUS');
    }

    const updated_user = await prisma.user.update({
      where: { id_user },
      data: {
        state: status as User_States,
      },
    });

    await invalidateCache(`cache:user:profile:${u_id}`); // Borramos la caché

    return {
      new_status: updated_user.state,
    };
  },

  /**
   * Realiza un borrado total de la cuenta y sus dependencias.
   */
  deleteUser: async (u_id: string) => {
    // 1. Limpiar el prefijo 'u_' del ID.
    // 2. USAR UNA TRANSACCIÓN (prisma.$transaction): Es crítico para asegurar que
    //    si falla el borrado de un mazo, no se borre el usuario a medias.
    // 3. LIMPIEZA EN CASCADA MANUAL (si no está definida en la DB):
    //    a. Eliminar asociaciones de cartas del usuario (UserCards).
    //    b. Eliminar todos los mazos (Decks) vinculados al ID.
    //    c. Eliminar registros de amistad o solicitudes pendientes.
    // 4. Eliminar el registro principal en la tabla 'user'.
    // 5. Opcional: Registrar el evento en logs de auditoría antes de finalizar.

    const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

    const user_decks = await prisma.deck.findMany({
      where: { id_user },
      select: { id_deck: true },
    });

    const deck_ids = user_decks.map((d) => d.id_deck);

    const user_purchases = await prisma.purchaseHistory.findMany({
      where: { id_user },
      select: { id_purchase: true },
    });
    const purchase_ids = user_purchases.map((p) => p.id_purchase);

    const resultado = await prisma.$transaction([
      prisma.purchaseHistoryCard.deleteMany({
        where: { id_purchase: { in: purchase_ids } },
      }),

      prisma.purchaseHistory.deleteMany({
        where: { id_user },
      }),

      prisma.userGameStats.deleteMany({
        where: { id_user },
      }),

      prisma.deckCard.deleteMany({
        where: {
          id_deck: { in: deck_ids },
        },
      }),

      prisma.userCard.deleteMany({
        where: { id_user },
      }),

      prisma.userBoard.deleteMany({
        where: { id_user },
      }),

      prisma.deck.deleteMany({
        where: { id_user },
      }),

      prisma.friendships.deleteMany({
        where: {
          OR: [{ id_user_1: id_user }, { id_user_2: id_user }],
        },
      }),

      prisma.user.delete({
        where: { id_user },
      }),
    ]);

    if (resultado) {
      // Destruimos todos los rastros del usuario en Redis
      await invalidateCache(`cache:user:profile:${u_id}`);
      await invalidateCache(`cache:user:economy:${u_id}`);
      await invalidateCache(`cache:user:cards:${u_id}`);
      await invalidateCache(`cache:user:decks:${u_id}`);
      return true;
    } else {
      return false;
    }
  },

  searchUsers: async (query: string) => {
    const users = await prisma.user.findMany({
      where: {
        username: { contains: query, mode: 'insensitive' },
      },
      select: {
        id_user: true,
        username: true,
      },
    });

    return users.map((user) => ({
      id: `${ID_PREFIXES.USER}${user.id_user}`,
      username: user.username,
    }));
  },

  // --- Economía e Inventario ---

  getUserEconomy: async (u_id: string) => {
    return getCachedData(`cache:user:economy:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));
      const user = await prisma.user.findUnique({
        where: { id_user },
        select: { coins: true },
      });

      return user ? { balance: user.coins } : null;
    });
  },

  getUserCards: async (u_id: string) => {
    return getCachedData(`cache:user:cards:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

      const userCards = await prisma.userCard.findMany({
        where: { id_user },
        include: { card: true }, // Traemos los detalles de la carta
      });

      // Contamos las instancias de cada carta
      const cardCounts: Record<
        number,
        { name: string; quantity: number; rarity: string; url_image: string }
      > = {};

      userCards.forEach((u_card) => {
        if (!cardCounts[u_card.id_card]) {
          cardCounts[u_card.id_card] = {
            name: u_card.card.title,
            quantity: 0,
            rarity: u_card.card.rarity,
            url_image: u_card.card.url_image,
          };
        }
        cardCounts[u_card.id_card].quantity += 1;
      });

      return Object.entries(cardCounts).map(([cardId, data]) => ({
        cardId: `${ID_PREFIXES.CARD}${cardId}`,
        name: data.name,
        quantity: data.quantity,
        rarity: data.rarity,
        url_image: data.url_image,
      }));
    });
  },
  // --- Tableros ---

  /**
   * Obtiene la lista de tableros comprados por el usuario.
   */
  getUserPurchasedBoards: async (u_id: string) => {
    return getCachedData(`cache:user:boards:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

      const userBoards = await prisma.userBoard.findMany({
        where: { id_user },
        include: { board: true }, // Traemos los detalles de la tabla Board
      });

      return userBoards.map((ub) => ({
        id: `${ID_PREFIXES.BOARD}${ub.board.id_board}`,
        name: ub.board.name,
        description: ub.board.description,
        url_image: ub.board.url_image,
      }));
    });
  },

  /**
   * Establece el tablero activo para que se muestre en las partidas del usuario.
   */
  setUserActiveBoard: async (u_id: string, boardId: string) => {
    const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));
    const id_board = parseInt(boardId.replace(ID_PREFIXES.BOARD, ''));

    // Verificar propiedad
    const ownership = await prisma.userBoard.findFirst({
      where: { id_user, id_board },
    });

    if (!ownership) {
      throw new Error('BOARD_NOT_OWNED');
    }

    // Actualizar el tablero activo
    const updatedUser = await prisma.user.update({
      where: { id_user },
      data: { active_board_id: id_board },
      include: { active_board: true },
    });

    // Limpieza de caché
    await invalidateCache(`cache:user:profile:${u_id}`);
    await invalidateCache(`cache:user:boards:${u_id}`);

    return {
      userId: u_id,
      activeBoard: {
        id: `${ID_PREFIXES.BOARD}${updatedUser.active_board?.id_board}`,
        name: updatedUser.active_board?.name,
      },
    };
  },

  // --- Mazos (Decks) ---

  getUserDecks: async (u_id: string) => {
    return getCachedData(`cache:user:decks:${u_id}`, async () => {
      const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

      const decks = await prisma.deck.findMany({
        where: { id_user },
        include: {
          cards: {
            include: { user_card: true },
          },
        },
      });

      return decks.map((deck) => ({
        id: `${ID_PREFIXES.DECK}${deck.id_deck}`,
        name: deck.name,
        cardIds: deck.cards.map(
          (deck_card) => `${ID_PREFIXES.CARD}${deck_card.user_card.id_card}`,
        ),
      })); // Extraemos el id_card genérico a partir del id_user_card
    });
  },

  getDeckById: async (d_id: string) => {
    return getCachedData(`cache:deck:${d_id}`, async () => {
      const id_deck = parseInt(d_id.replace(ID_PREFIXES.DECK, ''));

      const deck = await prisma.deck.findUnique({
        where: { id_deck },
        include: {
          cards: {
            include: { user_card: true },
          },
        },
      });

      if (!deck) return null;

      return {
        id: `${ID_PREFIXES.DECK}${deck.id_deck}`,
        name: deck.name,
        cardIds: deck.cards.map(
          (deck_card) => `${ID_PREFIXES.CARD}${deck_card.user_card.id_card}`,
        ),
      }; // Extraemos el id_card genérico a partir del id_user_card
    });
  },

  createDeck: async (u_id: string, name: string, cardsIds: string[]) => {
    const id_user = parseInt(u_id.replace(ID_PREFIXES.USER, ''));
    const numericCardsIds = cardsIds.map((c_id) =>
      parseInt(c_id.replace(ID_PREFIXES.CARD, '')),
    );

    const deckCardsData = await getPhysicalCardsForDeck(
      id_user,
      numericCardsIds,
    );

    const newDeck = await prisma.deck.create({
      data: {
        name: name,
        id_user: id_user,
        cards: {
          create: deckCardsData,
        },
      },
    });

    await invalidateCache(`cache:user:decks:${u_id}`);

    return {
      id: `${ID_PREFIXES.DECK}${newDeck.id_deck}`,
      name: newDeck.name,
      cardIds: cardsIds,
    };
  },

  updateDeck: async (
    d_id: string | string[],
    name: string,
    cardsIds: string[],
  ) => {
    const isArray = Array.isArray(d_id);
    const ids = isArray ? d_id : [d_id as string];
    const ids_decks = ids
      .map((id) => parseInt(id.replace(ID_PREFIXES.DECK, '')))
      .filter((id) => !isNaN(id));

    if (ids_decks.length === 0) throw new Error('IDs de mazo inválidos.');

    const numericCardsIds = cardsIds.map((id) =>
      parseInt(id.replace(ID_PREFIXES.CARD, '')),
    );

    const existingDecks = await prisma.deck.findMany({
      where: { id_deck: { in: ids_decks } },
    });

    if (existingDecks.length === 0) throw new Error('Mazos no encontrados.');

    // Se selecciona el id del dueño para invalidar su lista de mazos en caché
    const ownerId = existingDecks[0].id_user;

    const transactionOperations = [];

    for (const deck of existingDecks) {
      // Obtenemos las cartas físicas para el dueño de este mazo en particular
      const deckCardsData = await getPhysicalCardsForDeck(
        deck.id_user,
        numericCardsIds,
      );

      // Añadimos el borrado de cartas viejas
      transactionOperations.push(
        prisma.deckCard.deleteMany({ where: { id_deck: deck.id_deck } }),
      );

      // Añadimos la actualización del mazo y la creación de las nuevas cartas
      transactionOperations.push(
        prisma.deck.update({
          where: { id_deck: deck.id_deck },
          data: { name: name, cards: { create: deckCardsData } },
        }),
      );
    }

    await prisma.$transaction(transactionOperations);

    // Invalidamos los mazos individuales que han cambiado
    for (const stringId of ids) {
      await invalidateCache(`cache:deck:${stringId}`);
    }

    //Invalidamos la vista de "Todos mis mazos" del dueño
    await invalidateCache(`cache:user:decks:${ID_PREFIXES.USER}${ownerId}`);

    const result = ids.map((id) => ({ id, name, cardIds: cardsIds }));

    return (isArray ? result : result[0]) as any;
  },

  deleteDeck: async (d_id: string | string[]) => {
    const ids = Array.isArray(d_id) ? d_id : [d_id as string];
    const ids_decks = ids
      .map((id) => parseInt(id.replace(ID_PREFIXES.DECK, '')))
      .filter((id) => !isNaN(id));

    if (ids_decks.length === 0) return false;

    const existingDecks = await prisma.deck.findMany({
      where: { id_deck: { in: ids_decks } },
      select: { id_user: true },
    });

    const resultado = await prisma.$transaction([
      prisma.deckCard.deleteMany({
        where: { id_deck: { in: ids_decks } },
      }),
      prisma.deck.deleteMany({
        where: { id_deck: { in: ids_decks } },
      }),
    ]);

    if (resultado[1].count > 0) {
      // 1. Borramos la caché de los mazos individuales que acaban de desaparecer
      for (const stringId of ids) {
        await invalidateCache(`cache:deck:${stringId}`);
      }

      // 2. Si logramos saber de quién eran, actualizamos su vista principal
      if (existingDecks.length > 0) {
        const ownerId = existingDecks[0].id_user;
        await invalidateCache(`cache:user:decks:${ID_PREFIXES.USER}${ownerId}`);
      }
    }

    return resultado[1].count > 0;
  },
};

// Funcion Auxiliar

// Busca todas las instancias que el usuario u_id posee de cada carta c_id
const getPhysicalCardsForDeck = async (
  id_user: number,
  numericCardsIds: number[],
) => {
  const userOwnedCards = await prisma.userCard.findMany({
    where: { id_user, id_card: { in: numericCardsIds } },
  });

  const usedPhysicalCards = new Set<number>();
  const deckCardsData = [];

  for (const targetCardId of numericCardsIds) {
    const physicalCard = userOwnedCards.find(
      (uc) =>
        uc.id_card === targetCardId && !usedPhysicalCards.has(uc.id_user_card),
    );

    if (!physicalCard) {
      throw new Error(
        `No tienes suficientes copias de la carta genérica con ID ${targetCardId}`,
      );
    }

    usedPhysicalCards.add(physicalCard.id_user_card);
    deckCardsData.push({ id_user_card: physicalCard.id_user_card });
  }

  return deckCardsData;
};
