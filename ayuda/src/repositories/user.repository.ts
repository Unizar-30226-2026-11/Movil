// infrastructure/redis/user-redis.repository.ts
import { redisClient } from '../infrastructure/redis';
import { userSessionRepository } from '../infrastructure/redis/user-session.schema';

export const UserRedisRepository = {
  /**
   * Busca la sesión por el ID (que es el userId)
   */
  async fetch(userId: string) {
    return await userSessionRepository.fetch(userId);
  },

  /**
   * Guarda o actualiza la sesión.
   * Usamos el userId como primer argumento para que sea la clave en Redis.
   */
  async saveSession(userId: string, lobbyCode: string): Promise<void> {
    await userSessionRepository.save(userId, {
      userId,
      lobbyCode,
    });
  },

  /**
   * Elimina la sesión cuando el usuario sale del juego
   */
  async clearSession(userId: string): Promise<void> {
    await userSessionRepository.remove(userId);
  },

  /**
   * Guarda un timestamp ultra-ligero con la última actividad del usuario.
   */
  async updateLastActivity(userId: string): Promise<void> {
    // Usamos una clave separada para no sobreescribir la sesión principal por error
    // y le damos un TTL (Time To Live) de 10 minutos para que se limpie sola si todo falla.
    const key = `user_activity:${userId}`;
    const client = redisClient; // Usamos el cliente nativo de redis

    await client.set(key, Date.now().toString(), { EX: 600 });
  },

  async getLastActivity(userId: string): Promise<number | null> {
    const key = `user_activity:${userId}`;
    const client = redisClient;

    const timeStr = await client.get(key);
    return timeStr ? parseInt(timeStr, 10) : null;
  },
};
