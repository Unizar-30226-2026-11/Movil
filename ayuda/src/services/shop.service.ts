// src/services/shop.service.ts
import { prisma } from '../infrastructure/prisma';
import { Purchase_Type } from '@prisma/client';
import { ShopRedisRepository } from '../repositories/shop.repository';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';
import { invalidateCache } from '../shared/utils/cache.utils';

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
  /**
   * Obtiene la tienda diaria privada de un usuario.
   * Utiliza Redis para cachear la tienda durante 24 horas.
   */
  public async getAvailableItems(userId: number): Promise<any> {
    const now = new Date();
    // Inicio del día actual en UTC (00:00:00) para filtrar transacciones de hoy
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
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

    // Consultar historial de compras de HOY (Para Sobres y Colecciones)
    const todayPurchases = await prisma.purchaseHistory.findMany({
      where: {
        id_user: userId,
        purchased_at: { gte: startOfDay },
      },
      select: { purchase_type: true },
    });

    const boughtPackToday = todayPurchases.some(
      (p) => p.purchase_type === 'CARD_PACK',
    );
    const boughtCollectionToday = todayPurchases.some(
      (p) => p.purchase_type === 'COLLECTION',
    );

    // Preguntamos al Repositorio si ya existe la tienda generada hoy
    const cachedShop = await ShopRedisRepository.getDailyShop(userId);
    if (cachedShop) {
      return {
        ...cachedShop,
        singleCards: cachedShop.singleCards.map((c: any) => ({
          ...c,
          // Se bloquea si la carta ya está en su inventario
          isPurchased: ownedCardIds.has(
            parseInt(c.id_card.replace(ID_PREFIXES.CARD, '')),
          ),
        })),
        boardOffer: cachedShop.boardOffer
          ? {
              ...cachedShop.boardOffer,
              // Se bloquea si el tablero ya está en su inventario
              isPurchased: ownedBoardIds.has(
                parseInt(
                  cachedShop.boardOffer.id_board.replace(ID_PREFIXES.BOARD, ''),
                ),
              ),
            }
          : null,
        collectionOffer: cachedShop.collectionOffer
          ? {
              ...cachedShop.collectionOffer,
              // Se bloquea si ya hay una transacción de tipo 'COLLECTION' hoy (Permitiria comprar la coleccion si se acabase ese dia mediante packs o cartas)
              isPurchased: boughtCollectionToday,
            }
          : null,
        cardPackOffer: cachedShop.cardPackOffer
          ? {
              ...cachedShop.cardPackOffer,
              // Se bloquea si ya hay una transacción de tipo 'CARD_PACK' hoy
              isPurchased: boughtPackToday,
            }
          : null,
      };
    }

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

    const baseShop = {
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

    await ShopRedisRepository.saveDailyShop(
      userId,
      baseShop,
      secondsUntilMidnight,
    );

    const shop = {
      ...baseShop,
      singleCards: baseShop.singleCards.map((c) => ({
        ...c,
        isPurchased: false, // Se generan para que no las tenga
      })),
      cardPackOffer: {
        ...baseShop.cardPackOffer,
        isPurchased: boughtPackToday,
      },
      collectionOffer: baseShop.collectionOffer
        ? {
            ...baseShop.collectionOffer,
            isPurchased: boughtCollectionToday,
          }
        : null,
      boardOffer: baseShop.boardOffer
        ? {
            ...baseShop.boardOffer,
            isPurchased: false, // Se genera para no tenerlo (o no lo hace)
          }
        : null,
    };

    return shop;
  }

  /**
   * Procesa la compra mediante Transacción de Prisma.
   */
  public async processPurchase(u_Id: string, itemId: string) {
    const userId = parseInt(u_Id.replace(ID_PREFIXES.USER, ''));

    const result = await prisma.$transaction(async (tx) => {
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

      // Validar límite de 1 vez al día para Sobres y Colecciones
      if (purchaseType === 'CARD_PACK' || purchaseType === 'COLLECTION') {
        const now = new Date();
        const startOfDay = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );

        const alreadyBoughtToday = await tx.purchaseHistory.findFirst({
          where: {
            id_user: userId,
            purchase_type: purchaseType,
            purchased_at: { gte: startOfDay },
          },
        });

        if (alreadyBoughtToday) {
          throw {
            status: 400,
            message: `Ya has comprado tu ${purchaseType === 'CARD_PACK' ? 'sobre' : 'colección'} diario.`,
          };
        }
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

    await Promise.all([
      invalidateCache(`cache:user:economy:${u_Id}`),
      invalidateCache(`cache:user:cards:${u_Id}`),
      invalidateCache(`cache:user:boards:${u_Id}`),
      invalidateCache(`cache:user:profile:${u_Id}`),
    ]);

    return result;
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

  /**
   * Verifica si el usuario ya posee un artículo o si ya ha consumido su límite diario.
   * Utilizado por el middleware de propiedad (checkItemNotOwned).
   */
  public async checkOwnership(u_Id: string, itemId: string): Promise<boolean> {
    const userId = parseInt(u_Id.replace(ID_PREFIXES.USER, ''));
    if (isNaN(userId))
      throw { status: 400, message: 'ID de usuario inválido.' };

    // Tableros (Cosméticos únicos)
    if (itemId.startsWith(ID_PREFIXES.BOARD)) {
      const boardId = parseInt(itemId.replace(ID_PREFIXES.BOARD, ''));
      const alreadyOwned = await prisma.userBoard.findFirst({
        where: { id_user: userId, id_board: boardId },
      });
      return !!alreadyOwned;
    }

    // Verificar Cartas Sueltas (Únicas)
    if (itemId.startsWith(ID_PREFIXES.CARD)) {
      const cardId = parseInt(itemId.replace(ID_PREFIXES.CARD, ''));
      const alreadyOwned = await prisma.userCard.findFirst({
        where: { id_user: userId, id_card: cardId },
      });
      return !!alreadyOwned;
    }

    if (itemId.startsWith(ID_PREFIXES.COLLECTION)) {
      const collId = parseInt(itemId.replace(ID_PREFIXES.COLLECTION, ''));

      const collection = await prisma.collection.findUnique({
        where: { id_collection: collId },
        include: { cards: true },
      });

      if (!collection || collection.cards.length === 0) return false;

      const ownedInCollCount = await prisma.userCard.count({
        where: {
          id_user: userId,
          id_card: { in: collection.cards.map((c) => c.id_card) },
        },
      });

      return ownedInCollCount === collection.cards.length;
    }

    // Sobre Diario (Límite 1 por día)
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    if (itemId === 'pack_daily') {
      const boughtToday = await prisma.purchaseHistory.findFirst({
        where: {
          id_user: userId,
          purchase_type: 'CARD_PACK',
          purchased_at: { gte: startOfDay },
        },
      });
      return !!boughtToday;
    }

    // Si el formato del item no coincide con nada conocido devolvemos false
    return false;
  }
}

export const ShopService = new ShopServiceClass();
