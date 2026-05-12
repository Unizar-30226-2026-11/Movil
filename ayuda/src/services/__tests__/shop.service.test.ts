import 'dotenv/config';

import { prisma } from '../../infrastructure/prisma';
import { redisClient } from '../../infrastructure/redis';
import { ShopRedisRepository } from '../../repositories/shop.repository';
import { ShopService } from '../../services/shop.service';
import { UserService } from '../../services/user.service';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';

describe('ShopService - Sistema de ', () => {
  let id_usuario_rico: number;
  let id_usuario_pobre: number;
  let test_card_id: number;
  let test_board_id: number;
  let test_collection_id: number;
  let cards_of_collection: number[] = [];

  beforeAll(async () => {
    // Salia error sino
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // Limpieza de usuarios de pruebas anteriores para evitar colisiones
    const ghostUsers = await prisma.user.findMany({
      where: { username: { in: ['ShopTester_Rico', 'ShopTester_Pobre'] } },
    });

    for (const ghost of ghostUsers) {
      await prisma.purchaseHistoryCard.deleteMany({
        where: { purchase: { id_user: ghost.id_user } },
      });
      await prisma.purchaseHistory.deleteMany({
        where: { id_user: ghost.id_user },
      });
      await prisma.userCard.deleteMany({ where: { id_user: ghost.id_user } });
      await prisma.userBoard.deleteMany({ where: { id_user: ghost.id_user } });
      await prisma.user.delete({ where: { id_user: ghost.id_user } });
    }

    // Crear sujetos de prueba
    const rico = await prisma.user.create({
      data: {
        username: 'ShopTester_Rico',
        email: 'rico@test.com',
        password: 'password123',
        coins: 10000,
      },
    });
    id_usuario_rico = rico.id_user;

    const pobre = await prisma.user.create({
      data: {
        username: 'ShopTester_Pobre',
        email: 'pobre@test.com',
        password: 'password123',
        coins: 10,
      },
    });
    id_usuario_pobre = pobre.id_user;

    // Obtener datos reales de la BD (creados por el seed) para las pruebas
    const card = await prisma.cards.findFirst();
    const coll = await prisma.collection.findFirst({
      include: { cards: true },
    });
    const board = await prisma.board.findFirst({ where: { price: { gt: 0 } } });

    if (!card || !coll || !board)
      throw new Error(
        'La base de datos debe estar poblada (seed) antes de los tests.',
      );

    test_card_id = card.id_card;
    test_collection_id = coll.id_collection;
    cards_of_collection = coll.cards.map((c) => c.id_card);
    test_board_id = board.id_board;
  });

  afterAll(async () => {
    const ids = [id_usuario_rico, id_usuario_pobre];
    await prisma.purchaseHistoryCard.deleteMany({
      where: { purchase: { id_user: { in: ids } } },
    });
    await prisma.purchaseHistory.deleteMany({
      where: { id_user: { in: ids } },
    });
    await prisma.userCard.deleteMany({ where: { id_user: { in: ids } } });
    await prisma.userBoard.deleteMany({ where: { id_user: { in: ids } } });
    await prisma.user.deleteMany({ where: { id_user: { in: ids } } });

    // Limpiar rastro en Redis
    await ShopRedisRepository.deleteDailyShop(id_usuario_rico);
    await ShopRedisRepository.deleteDailyShop(id_usuario_pobre);
  });

  describe('Obtención de Tienda -> getAvailableItems()', () => {
    test('Debe generar una tienda válida con el formato correcto', async () => {
      const shop = await ShopService.getAvailableItems(id_usuario_rico);

      expect(shop).toBeDefined();
      expect(shop.singleCards).toHaveLength(3);
      expect(shop.singleCards[0]).toEqual(
        expect.objectContaining({
          id_card: expect.stringMatching(
            new RegExp(`^${ID_PREFIXES.CARD}\\d+$`),
          ),
          url_image: expect.any(String),
        }),
      );
      expect(shop.cardPackOffer).toBeDefined();
      if (shop.boardOffer) {
        expect(shop.boardOffer).toEqual(
          expect.objectContaining({
            id_board: expect.stringMatching(
              new RegExp(`^${ID_PREFIXES.BOARD}\\d+$`),
            ),
            name: expect.any(String),
            description: expect.any(String),
            price: expect.any(Number),
          }),
        );
      }
      expect(new Date(shop.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    test('Debe recuperar la tienda de Redis si ya existe (Caché)', async () => {
      // Forzamos guardado
      const firstCall = await ShopService.getAvailableItems(id_usuario_pobre);

      // Espiamos a Prisma: no debería llamarse a cards.findMany en la segunda vuelta
      const prismaSpy = jest.spyOn(prisma.cards, 'findMany');

      // Segunda llamada: debería obtener los datos de Redis sin consultar la BD
      const secondCall = await ShopService.getAvailableItems(id_usuario_pobre);

      expect(secondCall).toEqual(firstCall);
      expect(prismaSpy).not.toHaveBeenCalled();

      prismaSpy.mockRestore();
    });

    test('Debe inyectar isPurchased: true dinámicamente si el usuario compró un artículo de la tienda en caché', async () => {
      const shopOriginal =
        await ShopService.getAvailableItems(id_usuario_pobre);
      const cardToBuyIdRaw = shopOriginal.singleCards[0].id_card;
      const cardToBuyId = parseInt(
        cardToBuyIdRaw.replace(ID_PREFIXES.CARD, ''),
      );

      // Simulamos que el usuario pobre consiguió la carta
      await prisma.userCard.create({
        data: { id_user: id_usuario_pobre, id_card: cardToBuyId },
      });

      // Solicitamos la tienda otra vez (traerá de Redis, pero inyectará el booleano al vuelo)
      const updatedShop = await ShopService.getAvailableItems(id_usuario_pobre);
      const modifiedCard = updatedShop.singleCards.find(
        (c: any) => c.id_card === cardToBuyIdRaw,
      );

      expect(modifiedCard.isPurchased).toBe(true);
    });

    test('No debe ofrecer un tablero que el usuario ya posee', async () => {
      const shopOriginal = await ShopService.getAvailableItems(id_usuario_rico);

      if (shopOriginal.boardOffer) {
        const tableroOfertadoIdRaw = shopOriginal.boardOffer.id_board;
        const tableroOfertadoId = parseInt(
          tableroOfertadoIdRaw.replace(ID_PREFIXES.BOARD, ''),
        );

        await prisma.userBoard.create({
          data: { id_user: id_usuario_rico, id_board: tableroOfertadoId },
        });

        await ShopRedisRepository.deleteDailyShop(id_usuario_rico);
        const nuevaShop = await ShopService.getAvailableItems(id_usuario_rico);

        if (nuevaShop.boardOffer) {
          expect(nuevaShop.boardOffer.id_board).not.toBe(tableroOfertadoId);
        } else {
          expect(nuevaShop.boardOffer).toBeNull();
        }
      }
    });

    test('No debe ofrecer una colección que el usuario ya tiene completa', async () => {
      // Forzamos que el usuario tenga TODAS las cartas de la colección de prueba
      await prisma.userCard.createMany({
        data: cards_of_collection.map((cardId) => ({
          id_user: id_usuario_rico,
          id_card: cardId,
        })),
      });

      // Borramos caché para obligar a regenerar la tienda
      await ShopRedisRepository.deleteDailyShop(id_usuario_rico);
      const shop = await ShopService.getAvailableItems(id_usuario_rico);

      if (shop.collectionOffer) {
        // Si hay una oferta, el ID no puede ser el de la colección que acabamos de completar
        expect(shop.collectionOffer.id_collection).not.toBe(test_collection_id);
      } else {
        // Si es null, también es correcto (no quedan más colecciones incompletas para este usuario)
        expect(shop.collectionOffer).toBeNull();
      }
    });
  });

  describe('Proceso de Compra -> processPurchase()', () => {
    beforeAll(async () => {
      // Quitamos las cartas y tableros que le regalamos al usuario
      // en los tests de "Obtención de Tienda" para que pueda comprarlos desde cero.
      await prisma.userCard.deleteMany({ where: { id_user: id_usuario_rico } });

      const hasBoard = await prisma.userBoard.findFirst({
        where: { id_user: id_usuario_rico, id_board: test_board_id },
      });
      if (hasBoard) {
        await prisma.userBoard.delete({
          where: { id_user_board: hasBoard.id_user_board },
        });
      }
    });

    describe('Flujos de Éxito', () => {
      test('Compra de carta individual exitosa', async () => {
        const res = await ShopService.processPurchase(
          `${ID_PREFIXES.USER}${id_usuario_rico}`,
          `${ID_PREFIXES.CARD}${test_card_id}`,
        );

        expect(res.itemName).toContain('Carta');
        expect(res.updatedEconomy.coins).toBeLessThan(10000);

        // Verificar persistencia
        const check = await prisma.userCard.findFirst({
          where: { id_user: id_usuario_rico, id_card: test_card_id },
        });
        expect(check).toBeDefined();
      });

      test('Compra de tablero exitosa', async () => {
        const hasBoard = await prisma.userBoard.findFirst({
          where: { id_user: id_usuario_rico, id_board: test_board_id },
        });

        if (hasBoard) {
          await prisma.userBoard.delete({
            where: { id_user_board: hasBoard.id_user_board },
          });
        }

        const res = await ShopService.processPurchase(
          `${ID_PREFIXES.USER}${id_usuario_rico}`,
          `${ID_PREFIXES.BOARD}${test_board_id}`,
        );

        expect(res.itemName).toContain('Tablero');
        expect(res.updatedEconomy.coins).toBeLessThan(10000);

        const ownership = await prisma.userBoard.findFirst({
          where: { id_user: id_usuario_rico, id_board: test_board_id },
        });
        expect(ownership).toBeDefined();
      });

      test('Debe invalidar la caché de balance tras una compra', async () => {
        const uniqueSuffix = Date.now();
        const cacheTestUser = await prisma.user.create({
          data: {
            username: `ShopBalanceCache_${uniqueSuffix}`,
            email: `shop-balance-${uniqueSuffix}@test.com`,
            password: 'password123',
            coins: 1000,
          },
        });

        try {
          const cacheTestUserId = `${ID_PREFIXES.USER}${cacheTestUser.id_user}`;
          const balanceBeforePurchase =
            await UserService.getUserEconomy(cacheTestUserId);

          expect(balanceBeforePurchase?.balance).toBe(1000);

          const purchaseResult = await ShopService.processPurchase(
            cacheTestUserId,
            `${ID_PREFIXES.CARD}${test_card_id}`,
          );

          const balanceAfterPurchase =
            await UserService.getUserEconomy(cacheTestUserId);

          expect(balanceAfterPurchase?.balance).toBe(
            purchaseResult.updatedEconomy.coins,
          );
          expect(balanceAfterPurchase?.balance).toBeLessThan(1000);
        } finally {
          await prisma.purchaseHistoryCard.deleteMany({
            where: { purchase: { id_user: cacheTestUser.id_user } },
          });
          await prisma.purchaseHistory.deleteMany({
            where: { id_user: cacheTestUser.id_user },
          });
          await prisma.userCard.deleteMany({
            where: { id_user: cacheTestUser.id_user },
          });
          await prisma.userBoard.deleteMany({
            where: { id_user: cacheTestUser.id_user },
          });
          await prisma.user.delete({
            where: { id_user: cacheTestUser.id_user },
          });
        }
      });
    });

    describe('Validaciones y Errores', () => {
      test('Error 400: No debe permitir comprar más de un sobre al día', async () => {
        // Primero le damos dinero extra por si acaso y simulamos la compra del pack de hoy
        await ShopRedisRepository.deleteDailyShop(id_usuario_rico); // Para asegurar que no falle por caché vacío
        await ShopService.getAvailableItems(id_usuario_rico); // Generar tienda con pack

        // Compra 1 (Éxito)
        await ShopService.processPurchase(
          `${ID_PREFIXES.USER}${id_usuario_rico}`,
          `pack_daily`,
        );

        // Compra 2 (Debe fallar)
        try {
          await ShopService.processPurchase(
            `${ID_PREFIXES.USER}${id_usuario_rico}`,
            `pack_daily`,
          );
          fail('Debería haber lanzado un error por límite diario');
        } catch (error: any) {
          expect(error.status).toBe(400);
          expect(error.message).toContain('Ya has comprado tu sobre');
        }
      });

      test('Error 403: Fondos insuficientes', async () => {
        try {
          await ShopService.processPurchase(
            `${ID_PREFIXES.USER}${id_usuario_pobre}`,
            `${ID_PREFIXES.CARD}${test_card_id}`,
          );
          fail('Debería haber lanzado un error');
        } catch (error: any) {
          expect(error.status).toBe(403);
          expect(error.message).toBe('Fondos insuficientes.');
        }
      });

      test('Error 404: Artículo no encontrado', async () => {
        try {
          await ShopService.processPurchase(
            `${ID_PREFIXES.USER}${id_usuario_rico}`,
            `${ID_PREFIXES.CARD}999999`,
          );
          fail('Debería haber lanzado un error');
        } catch (error: any) {
          expect(error.status).toBe(404);
        }
      });
    });
  });

  describe('Historial de Compras -> getPurchaseHistory()', () => {
    test('Debe listar las compras realizadas por el usuario', async () => {
      const history = await ShopService.getPurchaseHistory(id_usuario_rico, 0);

      expect(history.length).toBeGreaterThanOrEqual(2);

      const boardPurchase = history.find((p) => p.type === 'BOARD');
      expect(boardPurchase).toBeDefined();

      expect(boardPurchase?.items[0]).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.BOARD}\\d+$`)),
          name: expect.any(String),
        }),
      );
    });
  });
});
