import 'dotenv/config';

import { prisma } from '../../infrastructure/prisma';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';
import { AuthService } from '../auth.service';

describe('AuthService - Pruebas Funciones', () => {
  const email_test: string = 'correo_de_prueba@gmail.com';

  const username_test: string = 'usuario_de_prueba';

  const password_test: string = 'test_password123';

  beforeAll(async () => {
    // Limpieza Preventiva
    const existingUser = await prisma.user.findUnique({
      where: { email: email_test },
    });
    if (existingUser) {
      await prisma.userBoard.deleteMany({
        where: { id_user: existingUser.id_user },
      });
      await prisma.user.delete({ where: { id_user: existingUser.id_user } });
    }

    await prisma.board.upsert({
      where: { name: 'CLASSIC' },
      update: {},
      create: {
        id_board: 1,
        name: 'CLASSIC',
        description: 'Tablero inicial',
        price: 0,
        url_image: 'https://midominio.com/boards/classic.png',
      },
    });
  });

  beforeEach(() => {});

  describe('Registrar Usuario. -> registerUser() ', () => {
    test('Registro Correcto (debe incluir monedas y tablero inicial):', async () => {
      const resultado = await AuthService.registerUser(
        email_test,
        username_test,
        password_test,
      );

      expect(resultado).toBeDefined();
      expect(resultado).toEqual({
        id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.USER}|\d+$`)),
        username: username_test,
        email: email_test,
      });

      // Comprobar que se ha creado la relación de tablero
      const userId = parseInt(resultado.id.replace(ID_PREFIXES.USER, ''));
      const boardCheck = await prisma.userBoard.findFirst({
        where: { id_user: userId },
      });
      expect(boardCheck).toBeDefined();
    });

    test('Campos Vacíos:', async () => {
      await expect(AuthService.registerUser('', '', '')).rejects.toThrow();
    });
  });

  describe('Buscar Usuario. -> findUserByEmailOrUsername() ', () => {
    test('Usuario Existente:', async () => {
      const resultado = await AuthService.findUserByEmailOrUsername(
        email_test,
        username_test,
      );

      expect(resultado).toBeDefined();
      expect(resultado).toEqual({
        id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.USER}\\d+$`)),
        username: expect.any(String),
        email: expect.stringMatching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
        coins: expect.any(Number),
        exp_level: expect.any(Number),
        progress_level: expect.any(Number),
        state: expect.stringMatching(
          /^(DISCONNECTED|CONNECTED|UNKNOWN|IN_GAME)$/,
        ),
        personal: resultado?.personal === null ? null : expect.any(String),
      });
    });

    test('Usuario Inexistente:', async () => {
      const resultado = await AuthService.findUserByEmailOrUsername(
        'jugadorFalso@test.com',
        'saltaError',
      );

      expect(resultado).toBeNull();
    });
  });

  describe('Inicio de Sesion Usuario. -> loginUser() ', () => {
    test('Usuario Existente:', async () => {
      const resultado = await AuthService.loginUser(email_test, password_test);

      expect(resultado).toBeDefined();
      expect(resultado).toEqual({
        token: expect.any(String),
        user: {
          id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.USER}\|d+$`)),
          username: expect.any(String),
        },
      });
    });

    test('Usuario Inexistente:', async () => {
      const resultado = await AuthService.loginUser(
        'jugadorFalso@test.com',
        'saltaError',
      );

      expect(resultado).toBeNull();
    });
  });

  afterAll(async () => {
    const existingUser = await prisma.user.findUnique({
      where: { email: email_test },
    });
    if (existingUser) {
      await prisma.userBoard.deleteMany({
        where: { id_user: existingUser.id_user },
      });
      await prisma.user.delete({ where: { id_user: existingUser.id_user } });
    }
  });

  afterEach(() => {});
});
