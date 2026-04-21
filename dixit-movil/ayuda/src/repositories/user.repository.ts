// infrastructure/redis/user-redis.repository.ts
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
};
