// src/repositories/shop.repository.ts
import { shopRepository } from '../infrastructure/redis/shop.schema';

export const ShopRedisRepository = {
  async saveDailyShop(userId: number, state: any, ttl: number): Promise<void> {
    const entity = {
      singleCards: JSON.stringify(state.singleCards),
      cardPackOffer: JSON.stringify(state.cardPackOffer),
      collectionOffer: JSON.stringify(state.collectionOffer ?? null),
      boardOffer: JSON.stringify(state.boardOffer ?? null),
      expiresAt: state.expiresAt,
    };

    // Usamos el ID de usuario como parte de la clave de Redis

    await shopRepository.save(`shop:${userId}`, entity);
    await shopRepository.expire(`shop:${userId}`, ttl);
  },

  async getDailyShop(userId: number): Promise<any | null> {
    const entity = await shopRepository.fetch(`shop:${userId}`);

    // Si no hay datos (entity.entityId es nulo en Redis-OM si no existe)
    if (!entity.expiresAt) return null;

    return {
      singleCards: JSON.parse(entity.singleCards as string) || '[]',
      cardPackOffer: JSON.parse(entity.cardPackOffer as string) || 'null',
      collectionOffer: JSON.parse((entity.collectionOffer as string) || 'null'),
      boardOffer: JSON.parse((entity.boardOffer as string) || 'null'),
      expiresAt: entity.expiresAt,
    };
  },

  /**
   * Elimina la tienda diaria almacenada en caché para un usuario.
   * Para los test y por si en el futuro se implementa un reroll de la tienda
   */
  async deleteDailyShop(userId: number): Promise<void> {
    await shopRepository.remove(`shop:${userId}`);
  },
};
