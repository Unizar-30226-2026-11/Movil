import 'dotenv/config';

import { Friendship_States } from '@prisma/client';

import { prisma } from '../../infrastructure/prisma';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';
import { FriendService } from '../friend.service';

describe('FriendService - Pruebas Funciones', () => {
  const users: number[] = [];
  let main_u: string;
  let friend_u: string;
  let stranger_u: string;
  const dynamic_relations: { id_user_1: number; id_user_2: number }[] = [];

  beforeAll(async () => {
    const oldUsers = await prisma.user.findMany({
      where: { username: { startsWith: 'FriendTest_' } },
    });
    const oldIds = oldUsers.map((u) => u.id_user);

    await prisma.friendships.deleteMany({
      where: {
        OR: [{ id_user_1: { in: oldIds } }, { id_user_2: { in: oldIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id_user: { in: oldIds } } });

    for (let i = 0; i < 10; i++) {
      const u = await prisma.user.create({
        data: {
          username: `FriendTest_${i}`,
          email: `ft${i}@test.com`,
          password: '123',
        },
      });
      users.push(u.id_user);
    }

    main_u = `${ID_PREFIXES.USER}${users[0]}`;
    friend_u = `${ID_PREFIXES.USER}${users[1]}`;
    stranger_u = `${ID_PREFIXES.USER}${users[9]}`;

    // Crear una amistad confirmada (User 0 y User 1)
    await prisma.friendships.create({
      data: {
        id_user_1: users[0],
        id_user_2: users[1],
        state: Friendship_States.FRIEND,
      },
    });

    // 4. Llenamos el array dinámico con 8 peticiones pendientes hacia el User 0
    // (Esto simula exactamente lo que hacía tu bucle antiguo)
    for (let i = 2; i <= 9; i++) {
      await prisma.friendships.create({
        data: {
          id_user_1: users[i],
          id_user_2: users[0],
          state: Friendship_States.PENDING,
        },
      });
      dynamic_relations.push({ id_user_1: users[i], id_user_2: users[0] });
    }
  });

  afterAll(async () => {
    // Limpieza final
    await prisma.friendships.deleteMany({
      where: {
        OR: [{ id_user_1: { in: users } }, { id_user_2: { in: users } }],
      },
    });
    await prisma.user.deleteMany({ where: { id_user: { in: users } } });
  });

  describe('Sistema de Búsqueda por IDs de usuario', () => {
    describe('Búsqueda de Amigos. -> getConfirmedFriends() ', () => {
      test('Usuario Existente:', async () => {
        const resultado = await FriendService.getConfirmedFriends(main_u);

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
              ),
              username: expect.stringMatching(/.+/),
              status: expect.stringMatching(
                /^(DISCONNECTED|CONNECTED|UNKNOWN|IN_GAME)$/,
              ),
            }),
          ]),
        );
      });

      test('Usuario Inexistente:', async () => {
        const resultado = await FriendService.getConfirmedFriends(
          `${ID_PREFIXES.USER}999999`,
        );

        expect(resultado).toHaveLength(0);
      });

      test('Campos Vacíos:', async () => {
        await expect(FriendService.getConfirmedFriends('')).rejects.toThrow();
      });

      test('Campos Incorrectos:', async () => {
        await expect(
          FriendService.getConfirmedFriends('usuarioPrueba'),
        ).rejects.toThrow();
      });
    });

    describe('Búsqueda de Solicitudes Pendientes. -> getPendingRequests() ', () => {
      test('Usuario Existente:', async () => {
        const resultado = await FriendService.getPendingRequests(main_u);

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.REQ}\\d+_\\d+$`),
              ),
              fromUserId: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
              ),
              toUserId: expect.stringMatching(
                new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
              ),
              createdAt: expect.anything(),
            }),
          ]),
        );
      });

      test('Usuario Inexistente:', async () => {
        const resultado = await FriendService.getPendingRequests(
          `${ID_PREFIXES.USER}999999`,
        );

        expect(resultado).toHaveLength(0);
      });

      test('Campos Vacíos:', async () => {
        await expect(FriendService.getPendingRequests('')).rejects.toThrow();
      });

      test('Campos Incorrectos:', async () => {
        await expect(
          FriendService.getPendingRequests('usuarioPrueba'),
        ).rejects.toThrow();
      });
    });

    describe('Comprobar relacion entre 2 usuarios. -> checkRelationshipStatus() ', () => {
      test('Relación Existente:', async () => {
        const resultado = await FriendService.checkRelationshipStatus(
          main_u,
          friend_u,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.stringMatching(/^(PENDING|FRIEND|BLOCKED)$/),
        );
      });

      test('Relación Inexistente:', async () => {
        const resultado = await FriendService.checkRelationshipStatus(
          main_u,
          stranger_u,
        );

        expect(resultado).toBeNull();
      });

      test('Campos Vacios:', async () => {
        await expect(
          FriendService.checkRelationshipStatus('', ''),
        ).rejects.toThrow();
      });

      test('Campos Incorrectos:', async () => {
        await expect(
          FriendService.checkRelationshipStatus(
            'usuarioPrueba1',
            'usuarioPrueba2',
          ),
        ).rejects.toThrow();
      });
    });
  });

  describe('Sistema de Peticiones de Amistad', () => {
    describe('Crear Peticion de Amistad -> createFriendRequest() ', () => {
      test('Usuarios Existentes:', async () => {
        const resultado = await FriendService.createFriendRequest(
          main_u,
          stranger_u,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toEqual(
          expect.objectContaining({
            id: expect.stringMatching(
              new RegExp(`^${ID_PREFIXES.REQ}\\d+_\\d+$`),
            ),
            fromUserId: expect.stringMatching(
              new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
            ),
            toUserId: expect.stringMatching(
              new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
            ),
          }),
        );
        expect(resultado?.toUserId).toBe(stranger_u);
      });

      test('Peticion Previamente Existente:', async () => {
        await expect(
          FriendService.createFriendRequest(main_u, stranger_u),
        ).rejects.toThrow();
      });

      test('Campos Vacios:', async () => {
        await expect(
          FriendService.createFriendRequest('', ''),
        ).rejects.toThrow();
      });

      test('Campos Incorrectos:', async () => {
        await expect(
          FriendService.createFriendRequest('usuarioPrueba1', 'usuarioPrueba2'),
        ).rejects.toThrow();
      });
    });

    describe('Buscar Peticion de Amistad -> findRequestById() ', () => {
      test('Relación Inexistente:', async () => {
        const resultado = await FriendService.findRequestById(
          `${ID_PREFIXES.REQ}999999999_999999`,
        );

        expect(resultado).toHaveLength(0);
      });

      test('Relación Existente:', async () => {
        for (let i = 0; i < 5; i++) {
          const relation = `${ID_PREFIXES.REQ}${dynamic_relations[i].id_user_1}_${dynamic_relations[i].id_user_2}`;
          const resultado = await FriendService.findRequestById(relation);

          expect(resultado).toBeDefined();
          expect(resultado).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: expect.stringMatching(
                  new RegExp(`^${ID_PREFIXES.REQ}\\d+_\\d+$`),
                ),
                fromUserId: expect.stringMatching(
                  new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
                ),
                toUserId: expect.stringMatching(
                  new RegExp(`^${ID_PREFIXES.USER}\\d+$`),
                ),
              }),
            ]),
          );
        }
      });

      test('Campos Vacios:', async () => {
        const resultado = await FriendService.findRequestById('');
        expect(resultado).toBeNull();
      });

      test('Campos Incorrectos:', async () => {
        const resultado = await FriendService.findRequestById(
          `${ID_PREFIXES.USER}14-${ID_PREFIXES.USER}12`,
        );
        expect(resultado).toBeNull();
      });
    });

    describe('Aceptar Peticion de Amistad -> acceptFriendRequest() ', () => {
      test('Petición Existente:', async () => {
        for (let i = 0; i < 5; i++) {
          const relation = `${ID_PREFIXES.REQ}${dynamic_relations[i].id_user_1}_${dynamic_relations[i].id_user_2}`;
          const resultado = await FriendService.acceptFriendRequest(relation);

          expect(resultado).toBeDefined();
          expect(resultado).toBeTruthy();
        }
      });

      test('Petición Inexistente:', async () => {
        const resultado = await FriendService.acceptFriendRequest(
          `${ID_PREFIXES.REQ}999999999_999999`,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });

      test('Campos Vacios:', async () => {
        const resultado = await FriendService.acceptFriendRequest('');

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });

      test('Campos Incorrectos:', async () => {
        const resultado = await FriendService.acceptFriendRequest(
          `${ID_PREFIXES.USER}14-${ID_PREFIXES.USER}12`,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });
    });

    describe('Rechazar Peticion de Amistad -> rejectFriendRequest() ', () => {
      test('Petición Existente:', async () => {
        for (let i = 5; i < 8; i++) {
          const relation = `${ID_PREFIXES.REQ}${dynamic_relations[i].id_user_1}_${dynamic_relations[i].id_user_2}`;
          const resultado = await FriendService.rejectFriendRequest(relation);

          expect(resultado).toBeDefined();
          expect(resultado).toBeTruthy();
        }
      });

      test('Petición Inexistente:', async () => {
        const resultado = await FriendService.rejectFriendRequest(
          `${ID_PREFIXES.REQ}999999999_999999`,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });

      test('Campos Vacios:', async () => {
        const resultado = await FriendService.rejectFriendRequest('');

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });

      test('Campos Incorrectos:', async () => {
        const resultado = await FriendService.rejectFriendRequest(
          `${ID_PREFIXES.USER}14-${ID_PREFIXES.USER}12`,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });
    });

    describe('Eliminar Amistad -> removeFriend() ', () => {
      test('Relacion Existente:', async () => {
        for (let i = 0; i < 5; i++) {
          const resultado = await FriendService.removeFriend(
            `${ID_PREFIXES.USER}${dynamic_relations[i].id_user_1}`,
            `${ID_PREFIXES.USER}${dynamic_relations[i].id_user_2}`,
          );

          expect(resultado).toBeDefined();
          expect(resultado).toBeTruthy();
        }
      });

      test('Relacion Inexistente:', async () => {
        const resultado = await FriendService.removeFriend(
          `${ID_PREFIXES.USER}999999999`,
          `${ID_PREFIXES.USER}99999999`,
        );

        expect(resultado).toBeDefined();
        expect(resultado).toBeFalsy();
      });

      test('Campos Vacios:', async () => {
        await expect(FriendService.removeFriend('', '')).rejects.toThrow();
      });

      test('Campos Incorrectos:', async () => {
        await expect(
          FriendService.removeFriend(
            `${ID_PREFIXES.REQ}1`,
            `${ID_PREFIXES.REQ}2`,
          ),
        ).rejects.toThrow();
      });
    });
  });

  afterAll(async () => {
    await prisma.friendships.deleteMany({
      where: {
        OR: [{ id_user_1: { in: users } }, { id_user_2: { in: users } }],
      },
    });
    await prisma.user.deleteMany({ where: { id_user: { in: users } } });
  });

  afterEach(() => {});
});
