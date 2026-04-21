import 'dotenv/config';

import { User_States } from '@prisma/client';

import { prisma } from '../../infrastructure/prisma';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';
import { UserService } from '../user.service';

describe('UserService - Pruebas Funciones', () => {
  let id_deck_created: string;

  // Variables dinámicas para reemplazar los IDs fijos (u_1, d_1, c_1...)
  let main_u: string;
  let id_usuario_a_borrar: string;
  let cartas_reales: string[] = []; // Guardará ['c_15', 'c_16'...]
  let cartas_reales_ids: number[] = []; // Guardará [15, 16...]
  const mazos_creados: string[] = []; // Guardará ['d_20', 'd_21'...]
  const mazos_a_borrar: string[] = [];

  beforeAll(async () => {
    const ghostUsers = await prisma.user.findMany({
      where: {
        username: {
          in: [
            'Jugador_Main',
            'UsuarioSacrificable_Full',
            'AmigoTest',
            'CambiadoC0Nexito',
            'Jugador1',
            'Ocupado',
          ],
        },
      },
    });

    for (const ghost of ghostUsers) {
      await prisma.purchaseHistoryCard.deleteMany({
        where: { purchase: { id_user: ghost.id_user } },
      });
      await prisma.purchaseHistory.deleteMany({
        where: { id_user: ghost.id_user },
      });
      await prisma.userGameStats.deleteMany({
        where: { id_user: ghost.id_user },
      });
      await prisma.deckCard.deleteMany({
        where: { deck: { id_user: ghost.id_user } },
      });
      await prisma.userCard.deleteMany({ where: { id_user: ghost.id_user } });
      await prisma.userBoard.deleteMany({ where: { id_user: ghost.id_user } });
      await prisma.deck.deleteMany({ where: { id_user: ghost.id_user } });
      await prisma.friendships.deleteMany({
        where: {
          OR: [{ id_user_1: ghost.id_user }, { id_user_2: ghost.id_user }],
        },
      });
      await prisma.user.delete({ where: { id_user: ghost.id_user } });
    }

    // Limpiamos tableros residuales del test
    await prisma.board.deleteMany({ where: { name: 'Tablero Test User' } });

    // Extraer cartas reales de la base de datos (necesitamos al menos 12 para los tests)
    const dbCards = await prisma.cards.findMany({ take: 12 });
    if (dbCards.length < 12)
      throw new Error('No hay 12 cartas en la BD. Ejecuta el seed.');

    cartas_reales_ids = dbCards.map((c) => c.id_card);
    cartas_reales = cartas_reales_ids.map((id) => `${ID_PREFIXES.CARD}${id}`);

    //Creamos un tablero para el usuario
    const testBoard = await prisma.board.create({
      data: {
        name: 'Tablero Test User',
        description: 'Tablero para pruebas de usuario',
        price: 100,
        url_image: 'https://test.com/board.png',
      },
    });

    // Crear el Usuario Principal
    const user_main = await prisma.user.create({
      data: {
        username: 'Jugador_Main', // Contiene "Jugador" para que funcione el searchUsers()
        email: 'main@test.com',
        password: 'hashed_password',
        state: 'CONNECTED',
        coins: 1000,
        active_board_id: testBoard.id_board,
      },
    });
    main_u = `${ID_PREFIXES.USER}${user_main.id_user}`;

    await prisma.userBoard.create({
      data: {
        id_user: user_main.id_user,
        id_board: testBoard.id_board,
      },
    });

    // Crear el Usuario Sacrificable
    const usuario_test = await prisma.user.create({
      data: {
        username: 'UsuarioSacrificable_Full',
        email: 'full_delete@test.com',
        password: 'hashed_password',
        state: 'UNKNOWN',
      },
    });
    id_usuario_a_borrar = `${ID_PREFIXES.USER}${usuario_test.id_user}`;

    // Crear un amigo falso para las FK
    const amigo_test = await prisma.user.create({
      data: { username: 'AmigoTest', email: 'am@test.com', password: '123' },
    });

    // Asignar las cartas reales a los usuarios
    await prisma.userCard.createMany({
      data: cartas_reales_ids.map((cardId) => ({
        id_user: user_main.id_user,
        id_card: cardId,
      })),
    });
    await prisma.userCard.createMany({
      data: cartas_reales_ids.map((cardId) => ({
        id_user: usuario_test.id_user,
        id_card: cardId,
      })),
    });

    // Crear los mazos de prueba
    for (let i = 0; i < 5; i++) {
      const cartas_mazo_prueba = cartas_reales.slice(0, 8);
      const resultado = await UserService.createDeck(
        main_u,
        `De Prueba ${i}`,
        cartas_mazo_prueba,
      );
      mazos_creados.push(resultado.id);
      mazos_a_borrar.push(resultado.id);
    }

    const carta1 = await prisma.userCard.create({
      data: { id_user: usuario_test.id_user, id_card: cartas_reales_ids[0] },
    });
    const carta2 = await prisma.userCard.create({
      data: { id_user: usuario_test.id_user, id_card: cartas_reales_ids[1] },
    });

    const mazo = await prisma.deck.create({
      data: { id_user: usuario_test.id_user, name: 'Mazo Condenado' },
    });

    await prisma.deckCard.createMany({
      data: [
        { id_deck: mazo.id_deck, id_user_card: carta1.id_user_card },
        { id_deck: mazo.id_deck, id_user_card: carta2.id_user_card },
      ],
    });

    await prisma.friendships.create({
      data: {
        id_user_1: usuario_test.id_user,
        id_user_2: amigo_test.id_user,
        state: 'FRIEND',
      },
    });
  });

  beforeEach(() => {});

  describe('Sistema de Búsqueda de usuarios', () => {
    describe('Búsqueda de un solo usuario por ID. ', () => {
      describe('Obtener perfil General -> getUserProfile() ', () => {
        test('Usuario Existente:', async () => {
          const resultado = await UserService.getUserProfile(main_u);

          expect(resultado).toBeDefined();
          expect(resultado).toEqual(
            expect.objectContaining({
              id_user: expect.any(Number),
              username: expect.stringMatching(/.+/),
              email: expect.stringMatching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
              exp_level: expect.any(Number),
              progress_level: expect.any(Number),
              state: expect.stringMatching(
                /^(DISCONNECTED|CONNECTED|UNKNOWN|IN_GAME)$/,
              ),
              personal_state:
                resultado?.personal_state === null ? null : expect.any(String),
              id: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
              ),
              boards: expect.arrayContaining([
                expect.objectContaining({
                  id: expect.stringMatching(
                    new RegExp(`^${ID_PREFIXES.BOARD}\\d+$`),
                  ),
                  name: expect.any(String),
                  url_image: expect.any(String),
                }),
              ]),
            }),
          );
        });

        test('Usuario Inexistente:', async () => {
          const resultado = await UserService.getUserProfile(
            `${ID_PREFIXES.USER}9999999`,
          );
          expect(resultado).toBeNull();
        });

        test('Campos Incorrectos:', async () => {
          await expect(
            UserService.getUserProfile(`${ID_PREFIXES.USER}abc`),
          ).rejects.toThrow();
        });

        test('Campos Vacios:', async () => {
          await expect(UserService.getUserProfile('')).rejects.toThrow();
        });
      });

      describe('Obtener balance (saldo) -> getUserEconomy() ', () => {
        test('Usuario Existente:', async () => {
          const resultado = await UserService.getUserEconomy(main_u);

          expect(resultado).toBeDefined();
          expect(resultado).toEqual(
            expect.objectContaining({
              balance: expect.any(Number),
            }),
          );
        });

        test('Usuario Inexistente:', async () => {
          const resultado = await UserService.getUserEconomy(
            `${ID_PREFIXES.USER}9999999`,
          );

          expect(resultado).toBeNull();
        });

        test('Campos Incorrectos:', async () => {
          await expect(
            UserService.getUserEconomy(`${ID_PREFIXES.USER}abc`),
          ).rejects.toThrow();
        });

        test('Campos Vacios:', async () => {
          await expect(UserService.getUserEconomy('')).rejects.toThrow();
        });
      });

      describe('Obtener Cartas -> getUserCards() ', () => {
        test('Usuario Existente:', async () => {
          const resultado = await UserService.getUserCards(main_u);

          expect(resultado).toBeDefined();
          expect(resultado).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                cardId: expect.stringMatching(
                  new RegExp(`^${ID_PREFIXES.CARD}\\d+$`),
                ),
                name: expect.any(String),
                quantity: expect.any(Number),
                url_image: expect.any(String),
              }),
            ]),
          );
        });

        test('Usuario Inexistente:', async () => {
          const resultado = await UserService.getUserCards(
            `${ID_PREFIXES.USER}999999`,
          );

          expect(resultado).toHaveLength(0);
        });

        test('Campos Incorrectos:', async () => {
          await expect(UserService.getUserCards('user_1')).rejects.toThrow();
        });
      });

      describe('Obtener Mazos -> getUserDecks() ', () => {
        test('Usuario Existente:', async () => {
          const resultado = await UserService.getUserDecks(main_u);

          expect(resultado).toBeDefined();
          expect(resultado).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: expect.stringMatching(
                  new RegExp(`^${ID_PREFIXES.DECK}\\d+$`),
                ),
                name: expect.any(String),
                cardIds: expect.arrayContaining([
                  expect.stringMatching(
                    new RegExp(`^${ID_PREFIXES.CARD}\\d+$`),
                  ),
                ]),
              }),
            ]),
          );
        });

        test('Usuario Inexistente:', async () => {
          const resultado = await UserService.getUserDecks(
            `${ID_PREFIXES.USER}999999999`,
          );

          expect(resultado).toHaveLength(0);
        });

        test('Campos Incorrectos:', async () => {
          await expect(UserService.getUserDecks('user_1')).rejects.toThrow();
        });
      });
    });

    describe('Búsqueda General de varios usuarios por Username. -> searchUsers() ', () => {
      test('Usuarios Existentes:', async () => {
        const resultado = await UserService.searchUsers('Jugador');

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
              ),
              username: expect.any(String),
            }),
          ]),
        );
      });

      test('Usuarios Inexistentes:', async () => {
        const resultado = await UserService.searchUsers('EstoNoExiste');

        expect(resultado).toBeDefined();
        expect(resultado).toHaveLength(0);
      });
    });
  });

  describe('Sistema de Mazos. ', () => {
    describe('Búsqueda de Mazo por ID. -> getDeckById() ', () => {
      test('Mazo Existente:', async () => {
        const resultado = await UserService.getDeckById(mazos_creados[0]);

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.objectContaining({
            id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.DECK}\\d+$`)),
            name: expect.any(String),
            cardIds: expect.arrayContaining([
              expect.stringMatching(new RegExp(`^${ID_PREFIXES.CARD}\\d+$`)),
            ]),
          }),
        );
      });

      test('Mazo Inexistente:', async () => {
        const resultado = await UserService.getDeckById(
          `${ID_PREFIXES.DECK}9999999`,
        );

        expect(resultado).toBeNull();
      });

      test('ID Incorrecto:', async () => {
        await expect(
          UserService.getDeckById(`${ID_PREFIXES.DECK}s1`),
        ).rejects.toThrow();
      });
    });

    describe('Creacion de Mazos. -> createDeck() ', () => {
      test('Mazo creado con éxito:', async () => {
        const cartas_mazo_prueba = cartas_reales.slice(0, 8);
        const resultado = await UserService.createDeck(
          main_u,
          'De Prueba',
          cartas_mazo_prueba,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.objectContaining({
            id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.DECK}\\d+$`)),
            name: expect.any(String),
            cardIds: expect.arrayContaining([
              expect.stringMatching(new RegExp(`^${ID_PREFIXES.CARD}\\d+$`)),
            ]),
          }),
        );
        id_deck_created = resultado.id;
      });

      test('Campos Incorrectos:', async () => {
        const cartas_mazo_prueba = cartas_reales.slice(0, 8);

        await expect(
          UserService.createDeck(
            `${ID_PREFIXES.USER}999999`,
            '',
            cartas_mazo_prueba,
          ),
        ).rejects.toThrow();
      });
    });

    describe('Actualización de Mazos. -> updateDeck() ', () => {
      test('Un solo mazo cambiado con éxito:', async () => {
        const cartas_mazo_prueba = cartas_reales.slice(0, 8).reverse();

        const resultado = await UserService.updateDeck(
          id_deck_created,
          'De Prueba Reorganizado',
          cartas_mazo_prueba,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.objectContaining({
            id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.DECK}\\d+$`)),
            name: expect.any(String),
            cardIds: expect.arrayContaining([
              expect.stringMatching(new RegExp(`^${ID_PREFIXES.CARD}\\d+$`)),
            ]),
          }),
        );
      });

      test('Varios mazos cambiados con éxito:', async () => {
        const cartas_mazo_prueba = cartas_reales.slice(0, 12);
        const mazos_a_cambiar = mazos_creados.slice(0, 4); // Coge los primeros 4 que creamos al inicio

        const resultado = await UserService.updateDeck(
          mazos_a_cambiar,
          'De Prueba Reorganizado',
          cartas_mazo_prueba,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.DECK}\\d+$`),
              ),
              name: expect.any(String),
              cardIds: expect.arrayContaining([
                expect.stringMatching(new RegExp(`^${ID_PREFIXES.CARD}\\d+$`)),
              ]),
            }),
          ]),
        );
      });

      test('Campos Incorrectos:', async () => {
        const cartas_mazo_prueba = cartas_reales.slice(0, 8);

        await expect(
          UserService.updateDeck(
            `${ID_PREFIXES.USER}9999999`,
            '',
            cartas_mazo_prueba,
          ),
        ).rejects.toThrow();
      });
    });

    describe('Borrado de Mazos. -> deleteDeck() ', () => {
      test('Un solo mazo borrado con éxito:', async () => {
        const resultado = await UserService.deleteDeck(id_deck_created);

        expect(resultado).toBeDefined();
        expect(resultado).toBeTruthy();
      });

      test('Varios mazos borrados con éxito:', async () => {
        const resultado = await UserService.deleteDeck(mazos_a_borrar);

        expect(resultado).toBeDefined();
        expect(resultado).toBeTruthy();
      });

      test('Campos Incorrectos:', async () => {
        const resultado = await UserService.deleteDeck('d-99');

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });
    });
  });

  describe('Actualizacion y Borrado de Usuarios. ', () => {
    describe('Actualizacion de nombre de usuario. -> updateUserProfile() ', () => {
      test('Usuario actualizado con éxito: ', async () => {
        const resultado = await UserService.updateUserProfile(
          main_u,
          'CambiadoC0Nexito',
        );

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.objectContaining({
            id_user: expect.any(Number),
            username: expect.stringMatching(/.+/),
            email: expect.stringMatching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
            exp_level: expect.any(Number),
            progress_level: expect.any(Number),
            state: expect.stringMatching(
              /^(DISCONNECTED|CONNECTED|UNKNOWN|IN_GAME)$/,
            ),
            personal_state:
              resultado?.personal_state === null ? null : expect.any(String),
            id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.USER}\\d+$`)),
          }),
        );
      });

      test('Nombre de usuario ya en uso (USERNAME_TAKEN): ', async () => {
        const estorbo = await prisma.user.create({
          data: { username: 'Ocupado', email: 'ocu@m.com', password: '123' },
        });

        await expect(
          UserService.updateUserProfile(main_u, 'Ocupado'),
        ).rejects.toThrow('USERNAME_TAKEN');

        await prisma.user.delete({ where: { id_user: estorbo.id_user } });
      });

      test('Usuario Inexistente: ', async () => {
        await expect(
          UserService.updateUserProfile(
            `${ID_PREFIXES.USER}999999999`,
            'noExisto',
          ),
        ).rejects.toThrow();
      });
    });

    describe('Actualizacion del estado de usuario. -> updatePresence()', () => {
      test('Prueba cambio de estados correcta: ', async () => {
        for (const state of Object.values(User_States)) {
          const resultado = await UserService.updatePresence(
            main_u,
            String(state),
          );

          expect(resultado).toBeDefined();
          expect(resultado).toEqual(
            expect.objectContaining({
              new_status: expect.stringMatching(
                /^(DISCONNECTED|CONNECTED|UNKNOWN|IN_GAME)$/,
              ),
            }),
          );
        }
      });

      test('Estado no permitido (INVALID_STATUS)', async () => {
        await expect(
          UserService.updatePresence(main_u, 'desconectado'),
        ).rejects.toThrow('INVALID_STATUS');
      });

      test('Usuario Inexistente: ', async () => {
        await expect(
          UserService.updatePresence(
            `${ID_PREFIXES.USER}9999999`,
            'DISCONNECTED',
          ),
        ).rejects.toThrow();
      });
    });

    describe('Borrado de un usuario. -> deleteUser() ', () => {
      test('Usuario borrado con éxito: ', async () => {
        const resultado = await UserService.deleteUser(id_usuario_a_borrar);

        expect(resultado).toBeDefined();
        expect(resultado).toBeTruthy();
      });

      test('Usuario inexistente: ', async () => {
        await expect(
          UserService.deleteUser(`${ID_PREFIXES.USER}99999999`),
        ).rejects.toThrow();
      });

      test('Entrada Incorrecta: ', async () => {
        await expect(UserService.deleteUser('Jugador1')).rejects.toThrow();
      });
    });
  });
  afterAll(async () => {
    try {
      const mazos_a_cambiar = mazos_creados.slice(0, 4);
      await UserService.updateDeck(
        mazos_a_cambiar,
        'Mazo Principal de JugadorX',
        cartas_reales.slice(0, 12),
      );
      await UserService.updateUserProfile(main_u, 'Jugador1');
    } catch (e) {
      // Ignorar si los mazos ya fueron borrados por el test deleteDeck()
    }
  });

  afterEach(() => {});
});
