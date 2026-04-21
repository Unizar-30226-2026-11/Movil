// src/services/shop.service.ts
import { Purchase_Type } from '@prisma/client';

import { prisma } from '../infrastructure/prisma';
import { ShopRedisRepository } from '../repositories/shop.repository';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';

// ==========================================
// DICCIONARIOS DE PRECIOS
// ==========================================

const RARITY_PRICES = {
  COMMON: 100,
  UNCOMMON: 300,
  SPECIAL: 800,
  EPIC: 1500,
  LEGENDARY: 3000,
};

/**
 * Redondea los precios para que terminen siempre en 0 o 5 (Economía limpia)
 */
const calculateCleanPrice = (basePrice: number, multiplier: number): number => {
  const rawPrice = basePrice * multiplier;
  return Math.floor(rawPrice / 5) * 5;
};

// ==========================================
// SERVICIO DE TIENDA
// ==========================================

class ShopServiceClass {
  public async checkOwnership(u_id: string, itemId: string): Promise<boolean> {
    const userId = parseInt(u_id.replace(ID_PREFIXES.USER, ''));

    if (Number.isNaN(userId)) {
      throw new Error('USER_ID_INVALID');
    }

    if (itemId.startsWith(ID_PREFIXES.BOARD)) {
      const boardId = parseInt(itemId.replace(ID_PREFIXES.BOARD, ''));
      if (Number.isNaN(boardId)) return false;

      const ownedBoard = await prisma.userBoard.findFirst({
        where: { id_user: userId, id_board: boardId },
        select: { id_user_board: true },
      });

      return Boolean(ownedBoard);
    }

    if (itemId.startsWith(ID_PREFIXES.CARD)) {
      const cardId = parseInt(itemId.replace(ID_PREFIXES.CARD, ''));
      if (Number.isNaN(cardId)) return false;

      const ownedCard = await prisma.userCard.findFirst({
        where: { id_user: userId, id_card: cardId },
        select: { id_user_card: true },
      });

      return Boolean(ownedCard);
    }

    if (itemId.startsWith(ID_PREFIXES.COLLECTION)) {
      const collId = parseInt(itemId.replace(ID_PREFIXES.COLLECTION, ''));
      if (Number.isNaN(collId)) return false;

      const collection = await prisma.collection.findUnique({
        where: { id_collection: collId },
        select: { cards: { select: { id_card: true } } },
      });

      if (!collection || collection.cards.length === 0) return false;

      const ownedCount = await prisma.userCard.count({
        where: {
          id_user: userId,
          id_card: { in: collection.cards.map((card) => card.id_card) },
        },
      });

      return ownedCount >= collection.cards.length;
    }

    if (itemId === 'pack_daily') {
      return false;
    }

    return false;
  }

  /**
   * Obtiene la tienda diaria privada de un usuario.
   * Utiliza Redis para cachear la tienda durante 24 horas.
   */
  public async getAvailableItems(userId: number): Promise<any> {
    // Preguntamos al Repositorio si ya existe la tienda generada hoy
    const cachedShop = await ShopRedisRepository.getDailyShop(userId);
    if (cachedShop) return cachedShop;

    // Cálculo de reinicio del servidor:

    const now = new Date();
    // Creamos una fecha que apunte exactamente a las 00:00:00 del día siguiente (en horario universal UTC)
    const nextMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    // Calculamos los segundos exactos que faltan para llegar a esa medianoche
    const secondsUntilMidnight = Math.floor(
      (nextMidnight.getTime() - now.getTime()) / 1000,
    );

    // Obtener inventario actual del usuario
    const userInventory = await prisma.user.findUnique({
      where: { id_user: userId },
      include: {
        my_cards: { select: { id_card: true } },
        my_boards: { select: { id_board: true } },
      },
    });

    const ownedCardIds = new Set(
      userInventory?.my_cards.map((c) => c.id_card) || [],
    );
    const ownedBoardIds = new Set(
      userInventory?.my_boards.map((b) => b.id_board) || [],
    );

    // Cartas individuales
    const allCards = await prisma.cards.findMany();
    const availableForSingles = allCards.filter(
      (c) => !ownedCardIds.has(c.id_card),
    );
    const singles = availableForSingles
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    // Coleccion
    const allColls = await prisma.collection.findMany({
      include: { cards: true },
    });
    const availableColls = allColls.filter((coll) =>
      coll.cards.some((card) => !ownedCardIds.has(card.id_card)),
    );
    const randomColl =
      availableColls.length > 0
        ? availableColls[Math.floor(Math.random() * availableColls.length)]
        : null;

    // Tablero
    const allBoards = await prisma.board.findMany();
    const availableBoards = allBoards.filter(
      (b) => !ownedBoardIds.has(b.id_board),
    );
    const selectedBoard =
      availableBoards.length > 0
        ? availableBoards[Math.floor(Math.random() * availableBoards.length)]
        : null;

    const pack = allCards.sort(() => 0.5 - Math.random()).slice(0, 5);

    const shop = {
      singleCards: singles.map((c) => ({
        id_card: `${ID_PREFIXES.CARD}${c.id_card}`,
        title: c.title,
        rarity: c.rarity,
        price: RARITY_PRICES[c.rarity],
        url_image: c.url_image,
      })),
      cardPackOffer: {
        id_pack: 'pack_daily',
        name: 'Sobre Diario',
        cards: pack.map((c) => ({
          id_card: `${ID_PREFIXES.CARD}${c.id_card}`,
          title: c.title,
          url_image: c.url_image,
        })),
        card_ids: pack.map((c) => c.id_card),
        description: '5 cartas con 25% de descuento',
        price: calculateCleanPrice(
          pack.reduce((sum, c) => sum + RARITY_PRICES[c.rarity], 0),
          0.75,
        ),
      },
      collectionOffer: randomColl
        ? {
            id_collection: `${ID_PREFIXES.COLLECTION}${randomColl.id_collection}`,
            name: randomColl.name,
            price: calculateCleanPrice(
              randomColl.cards.reduce(
                (sum, c) => sum + RARITY_PRICES[c.rarity],
                0,
              ),
              0.8,
            ),
          }
        : null,
      boardOffer: selectedBoard
        ? {
            id_board: `${ID_PREFIXES.BOARD}${selectedBoard.id_board}`,
            name: selectedBoard.name,
            price: selectedBoard.price,
            description: selectedBoard.description,
            url_image: selectedBoard.url_image,
          }
        : null,
      expiresAt: nextMidnight.toISOString(),
    };

    await ShopRedisRepository.saveDailyShop(userId, shop, secondsUntilMidnight);
    return shop;
  }

  /**
   * Procesa la compra mediante Transacción de Prisma.
   */
  public async processPurchase(u_Id: string, itemId: string) {
    const userId = parseInt(u_Id.replace(ID_PREFIXES.USER, ''));

    return await prisma.$transaction(async (tx) => {
      let totalCost = 0;
      let cardsToAdd: number[] = [];
      let boardToAddId: number | null = null;
      let purchaseType: Purchase_Type;
      let itemNameForResponse = ''; // Para devolverlo en el success al controlador

      // Identificacion del artículo y validación
      if (itemId.startsWith(ID_PREFIXES.BOARD)) {
        purchaseType = 'BOARD';
        boardToAddId = parseInt(itemId.replace(ID_PREFIXES.BOARD, ''));

        const board = await tx.board.findUnique({
          where: { id_board: boardToAddId },
        });
        if (!board) throw { status: 404, message: 'Tablero no encontrado.' };

        const alreadyOwned = await tx.userBoard.findFirst({
          where: { id_user: userId, id_board: boardToAddId },
        });
        if (alreadyOwned)
          throw { status: 400, message: 'Ya posees este tablero.' };

        totalCost = board.price;
        itemNameForResponse = `Tablero: ${board.name}`;
      } else if (itemId.startsWith(ID_PREFIXES.CARD)) {
        purchaseType = 'SINGLE_CARD';
        const cardId = parseInt(itemId.replace(ID_PREFIXES.CARD, ''));

        const card = await tx.cards.findUnique({ where: { id_card: cardId } });
        if (!card) throw { status: 404, message: 'Carta no encontrada.' };

        totalCost = RARITY_PRICES[card.rarity];
        cardsToAdd.push(card.id_card);
        itemNameForResponse = `Carta: ${card.title}`;
      } else if (itemId.startsWith(ID_PREFIXES.COLLECTION)) {
        purchaseType = 'COLLECTION';
        const collId = parseInt(itemId.replace(ID_PREFIXES.COLLECTION, ''));

        const collection = await tx.collection.findUnique({
          where: { id_collection: collId },
          include: { cards: true },
        });
        if (!collection)
          throw { status: 404, message: 'Colección no encontrada.' };

        const ownedInColl = await tx.userCard.findMany({
          where: {
            id_user: userId,
            id_card: { in: collection.cards.map((c) => c.id_card) },
          },
        });
        if (ownedInColl.length === collection.cards.length) {
          throw {
            status: 400,
            message: 'Ya posees todas las cartas de esta colección.',
          };
        }

        totalCost = calculateCleanPrice(
          collection.cards.reduce((sum, c) => sum + RARITY_PRICES[c.rarity], 0),
          0.8,
        );
        cardsToAdd = collection.cards.map((c) => c.id_card);
        itemNameForResponse = `Colección: ${collection.name}`;
      } else if (itemId === 'pack_daily') {
        purchaseType = 'CARD_PACK';
        // Leemos Redis para saber qué cartas traía el pack de hoy
        const dailyShop = await ShopRedisRepository.getDailyShop(userId);
        if (!dailyShop || !dailyShop.cardPackOffer)
          throw { status: 404, message: 'Oferta no encontrada' };

        totalCost = dailyShop.cardPackOffer.price;
        cardsToAdd = dailyShop.cardPackOffer.card_ids;
        itemNameForResponse = dailyShop.cardPackOffer.name;
      } else {
        throw { status: 400, message: 'Formato de artículo desconocido.' };
      }

      // --- PROCESO DE PAGO ---
      const user = await tx.user.findUnique({
        where: { id_user: userId },
        select: { coins: true },
      });
      if (!user) throw { status: 404, message: 'Usuario no encontrado.' };

      if (user.coins < totalCost) {
        throw {
          status: 403,
          message: 'Fondos insuficientes.',
          required: totalCost,
          currentBalance: user.coins,
        };
      }

      await tx.user.update({
        where: { id_user: userId },
        data: { coins: { decrement: totalCost } },
      });

      if (boardToAddId) {
        await tx.userBoard.create({
          data: { id_user: userId, id_board: boardToAddId },
        });
      }

      if (cardsToAdd.length > 0) {
        await tx.userCard.createMany({
          data: cardsToAdd.map((id) => ({ id_user: userId, id_card: id })),
        });
      }

      const purchase = await tx.purchaseHistory.create({
        data: {
          id_user: userId,
          purchase_type: purchaseType,
          coins_spent: totalCost,
          board_id: boardToAddId,
        },
      });

      if (cardsToAdd.length > 0) {
        await tx.purchaseHistoryCard.createMany({
          data: cardsToAdd.map((id) => ({
            id_purchase: purchase.id_purchase,
            id_card: id,
          })),
        });
      }

      const updatedUser = await tx.user.findUnique({
        where: { id_user: userId },
        select: { coins: true },
      });
      return {
        itemName: itemNameForResponse,
        updatedEconomy: { userId, coins: updatedUser?.coins },
      };
    });
  }

  /**
   * Obtiene el historial de compras del usuario.
   * @param amount Cantidad de registros a devolver (Por defecto 25. Pasa 0 para obtener TODOS).
   */
  public async getPurchaseHistory(userId: number, amount: number = 25) {
    const history = await prisma.purchaseHistory.findMany({
      where: { id_user: userId },
      orderBy: { purchased_at: 'desc' },
      take: amount === 0 ? undefined : amount,
      include: {
        board: true, // Trae info del tablero comprado
        cards: { include: { card: true } }, // Trae info de las cartas compradas
      },
    });

    // Mapeamos para que el frontend reciba exactamente lo mismo que en user.service
    return history.map((record) => ({
      id_purchase: record.id_purchase,
      type: record.purchase_type,
      cost: record.coins_spent,
      date: record.purchased_at,
      items:
        record.purchase_type === 'BOARD' && record.board
          ? [
              {
                id: `${ID_PREFIXES.BOARD}${record.board.id_board}`,
                name: record.board.name,
                url_image: record.board.url_image,
              },
            ]
          : record.cards.map((c) => ({
              id: `${ID_PREFIXES.CARD}${c.card.id_card}`,
              name: c.card.title,
              url_image: c.card.url_image,
            })),
    }));
  }
}

export const ShopService = new ShopServiceClass();
