import { connectRedis, redisClient } from '../../../infrastructure/redis'; // Ajusta tu ruta
import {
  getCachedData,
  getCachedItem,
  invalidateCache,
  setCachedData,
} from '../cache.utils';

describe('CacheUtils - Pruebas Funciones', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  });

  afterEach(async () => {
    const keys = await redisClient.keys('test:integration:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  });

  describe('setCachedData, getCachedItem & invalidateCache', () => {
    test('Debe guardar y recuperar un Objeto complejo: ', async () => {
      const key = 'test:integration:obj';
      const data = { username: 'Jugador1', stats: { wins: 10, losses: 2 } };

      await setCachedData(key, data, 60);
      const recovered = await getCachedItem(key);

      expect(recovered).toEqual(data);
    });

    test('Debe guardar y recuperar un Array: ', async () => {
      const key = 'test:integration:array';
      const data = ['espada', 'escudo', 'pocion'];

      await setCachedData(key, data, 60);
      const recovered = await getCachedItem(key);

      expect(recovered).toEqual(data);
    });

    test('Debe devolver null si el item no existe: ', async () => {
      const recovered = await getCachedItem('test:integration:fantasma');
      expect(recovered).toBeNull();
    });

    test('Debe borrar un dato existente correctamente: ', async () => {
      const key = 'test:integration:delete';
      await setCachedData(key, { value: 123 }, 60);

      await invalidateCache(key);

      const recovered = await getCachedItem(key);
      expect(recovered).toBeNull();
    });

    test('Debe aplicar el tiempo de expiración (TTL) correctamente: ', async () => {
      const key = 'test:integration:ttl';
      await setCachedData(key, { temp: true }, 120); // 120 segundos

      // Consultamos a Redis directamente cuánto tiempo le queda a la clave
      const ttl = await redisClient.ttl(key);

      // Debería ser cercano a 120
      expect(ttl).toBeGreaterThan(115);
      expect(ttl).toBeLessThanOrEqual(120);
    });
  });

  describe('getCachedData (Patrón Cache-Aside)', () => {
    test('CACHE MISS: Si no está en Redis, llama a la BD y luego lo guarda', async () => {
      const key = 'test:integration:miss';
      const freshDataFromDb = { level: 50 };

      // Creamos una función que simula ser Prisma
      const dbQuerySpy = jest.fn().mockResolvedValue(freshDataFromDb);

      const result = await getCachedData(key, dbQuerySpy, 60);

      expect(result).toEqual(freshDataFromDb);
      expect(dbQuerySpy).toHaveBeenCalledTimes(1);

      // Verificamos que se haya guardado en Redis para la próxima vez
      const savedInRedis = await getCachedItem(key);
      expect(savedInRedis).toEqual(freshDataFromDb);
    });

    test('CACHE HIT: Si ya está en Redis, NO llama a la BD', async () => {
      const key = 'test:integration:hit';
      const cachedData = { coins: 999 };

      // Pre-cargamos el dato en Redis
      await setCachedData(key, cachedData, 60);

      const dbQuerySpy = jest.fn().mockResolvedValue({ coins: 0 }); // La BD tiene otro valor

      const result = await getCachedData(key, dbQuerySpy, 60);

      expect(result).toEqual(cachedData);
      expect(dbQuerySpy).not.toHaveBeenCalled();
    });

    test('Si la BD devuelve null, NO se guarda en Redis', async () => {
      const key = 'test:integration:null_db';

      const dbQuerySpy = jest.fn().mockResolvedValue(null);

      const result = await getCachedData(key, dbQuerySpy, 60);

      expect(result).toBeNull();
      expect(dbQuerySpy).toHaveBeenCalledTimes(1);

      // Verificamos que Redis siga vacío (no queremos cachear "nulls" inútiles)
      const savedInRedis = await getCachedItem(key);
      expect(savedInRedis).toBeNull();
    });
  });
});
