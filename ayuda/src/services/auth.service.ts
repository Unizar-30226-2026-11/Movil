// services/auth.service.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { SignOptions } from 'jsonwebtoken';

import { prisma } from '../infrastructure/prisma';
import { UserRedisRepository } from '../repositories';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';

export const AuthService = {
  // Comprueba si ya existe un usuario con ese email o username
  findUserByEmailOrUsername: async (email: string, username: string) => {
    const resultado = await prisma.user.findFirst({
      where: {
        OR: [{ email: email }, { username: username }],
      },
    });

    if (resultado == null) return null;

    return {
      id: `${ID_PREFIXES.USER}${resultado.id_user}`,
      username: resultado.username,
      email: resultado.email,
      coins: resultado.coins,
      exp_level: resultado.exp_level,
      progress_level: resultado.progress_level,
      state: resultado.state,
      personal: resultado.personal_state,
    };
  },

  // Encapsula la lógica de hashear la contraseña y guardar al usuario
  registerUser: async (
    email: string,
    username: string,
    passwordRaw: string,
  ) => {
    if (!email.trim() || !username.trim() || !passwordRaw.trim()) {
      throw new Error(
        'Los campos email, username y password son obligatorios.',
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(passwordRaw, saltRounds);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          coins: 500,
        },
      });

      // Buscar el ID del tablero 'CLASSIC' (Asumimos que el ID es 1 por el Seed)
      // Si prefieres buscarlo por nombre para ser más seguro:
      const classicBoard = await tx.board.findUnique({
        where: { name: 'CLASSIC' },
      });
      const classicId = classicBoard?.id_board || 1;

      // Darle la propiedad del tablero
      await tx.userBoard.create({
        data: {
          id_user: user.id_user,
          id_board: classicId,
        },
      });

      // Establecerlo como activo
      return await tx.user.update({
        where: { id_user: user.id_user },
        data: { active_board_id: classicId },
      });
    });
    return {
      id: `${ID_PREFIXES.USER}${newUser.id_user}`,
      username: newUser.username,
      email: newUser.email,
    };
  },

  // Encapsula la búsqueda, comparación de contraseñas y generación del token JWT
  loginUser: async (email: string, passwordRaw: string) => {
    // Buscar al usuario
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return null;
    }

    // Comparar contraseña
    const isPasswordValid = await bcrypt.compare(passwordRaw, user.password);
    if (!isPasswordValid) {
      return null; // Retornamos null si las credenciales fallan
    }

    // Generar el token JWT
    const secretKey = process.env.JWT_SECRET || 'super_secret_fallback_key';
    const token = jwt.sign(
      { id: `${ID_PREFIXES.USER}${user.id_user}`, username: user.username },
      secretKey,
      { expiresIn: '24h' },
    );

    return {
      token,
      user: {
        id: `${ID_PREFIXES.USER}${user.id_user}`,
        username: user.username,
      },
    };
  },

  /**
   * Busca si el usuario tiene una sesión activa y devuelve el lobbyCode
   */
  getUserActiveLobby: async (userId: string): Promise<string | null> => {
    try {
      // Fetch devuelve el objeto guardado en Redis-OM
      const session = await UserRedisRepository.fetch(userId);

      // En Redis-OM, si no existe, devuelve un objeto vacío o con valores nulos,
      // pero comprobamos si tiene el lobbyCode
      if (session && session.lobbyCode) {
        return session.lobbyCode as string;
      }

      return null;
    } catch (error) {
      console.error('Error al obtener sesión de Redis-OM:', error);
      return null;
    }
  },

  /**
   * Guarda la sesión del usuario al unirse a un lobby
   */
  saveUserSession: async (userId: string, lobbyCode: string): Promise<void> => {
    try {
      // Directo al grano: guardar userId con su lobbyCode
      await UserRedisRepository.saveSession(userId, lobbyCode);
    } catch (error) {
      console.error('Error al guardar sesión en Redis:', error);
      throw new Error('No se pudo persistir la sesión de juego.', {
        cause: error,
      });
    }
  },

  // Genera un token corto para conexión WebSocket (lobby o reconexión)
  generateLobbyToken: async (
    userId: string,
    username: string,
    lobbyCode: string | null,
  ): Promise<string> => {
    const secretKey = process.env.JWT_SECRET || 'super_secret_fallback_key';
    const wsTokenExpiresIn: SignOptions['expiresIn'] =
      (process.env.JWT_WS_EXPIRES_IN as SignOptions['expiresIn']) ?? '3m';

    return jwt.sign(
      {
        id: userId,
        username,
        lobbyCode,
      },
      secretKey,
      { expiresIn: wsTokenExpiresIn },
    );
  },
};
