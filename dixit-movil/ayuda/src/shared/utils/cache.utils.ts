import { redisClient } from '../../infrastructure/redis';

const ensureRedisConnection = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

/**
 * Guarda un dato en la caché abstrayendo la serialización y el manejo de errores.
 * @param key La clave única (ej: 'cache:collection:id:1')
 * @param data El dato a guardar (Objeto, Array, String, etc.)
 * @param expirationSeconds Tiempo de vida en segundos (Por defecto: 1 hora)
 */
export async function setCachedData<T>(
  key: string,
  data: T,
  expirationSeconds: number = 3600,
): Promise<void> {
  try {
    await ensureRedisConnection();
    // Abstraemos el stringify y la sintaxis del tiempo (la fijamos a segundos).
    await redisClient.set(key, JSON.stringify(data), { EX: expirationSeconds });
  } catch (error) {
    console.error(
      `[Error Caché Redis] Fallo al guardar la clave ${key}:`,
      error,
    );
  }
}

/**
 * Obtiene datos usando el patrón Cache-Aside (Lazy Loading).
 * @param key La clave única bajo la que se guardará en Redis (ej: 'cache:user:1')
 * @param dbQuery Una función que ejecuta la consulta real a la base de datos
 * @param expirationSeconds Tiempo de vida en Redis en segundos (Por defecto 1 hora)
 * @returns El dato tipado, ya sea de Redis o de la BD.
 */
export async function getCachedData<T>(
  key: string,
  dbQuery: () => Promise<T | null>,
  expirationSeconds: number = 3600,
): Promise<T | null> {
  try {
    await ensureRedisConnection();
    // Intento de lectura en caché (CACHÉ HIT)
    const cachedData = await redisClient.get(key);

    if (cachedData) {
      return JSON.parse(cachedData) as T; // Si existe lo devolvemos en el tipo de dato original.
    }

    const newData = await dbQuery(); // Hay fallo de caché hay que ir a PostreSQL

    if (newData) {
      // Guardamos en redis si se encontró algo en la llamada
      await setCachedData(key, newData, expirationSeconds);
    }

    return newData;
  } catch (error) {
    console.error(
      `[Error Caché Redis] Fallo al operar con la clave ${key}:`,
      error,
    );
    return await dbQuery();
  }
}

/**
 * Recupera un item específico de la caché sin consultar a la base de datos.
 * @template T - Tipo de dato esperado.
 * @param key - Clave única a buscar en Redis. (ej: 'cache:user:1')
 * @returns El objeto parseado si existe, o null si hay un Cache Miss o fallo de conexión.
 */
export async function getCachedItem<T>(key: string): Promise<T | null> {
  try {
    await ensureRedisConnection();
    // Intento de lectura en caché (CACHÉ HIT)
    const cached = await redisClient.get(key);

    if (cached) {
      return JSON.parse(cached) as T; // Si existe lo devolvemos en el tipo de dato original.
    }
    return null;
  } catch (error) {
    console.error(`[Error Caché Redis] Fallo al leer la clave ${key}:`, error);
    return null;
  }
}

/**
 * Invalida (borra) un dato específico de la caché.
 * Debe llamarse siempre que ocurra una mutación (update/delete) en la base de datos
 * para evitar que los clientes lean datos obsoletos.
 * @param key La clave a destruir (ej: 'cache:user:1')
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    await ensureRedisConnection();
    await redisClient.del(key);
  } catch (error) {
    console.error(
      `[Error Caché Redis] Fallo al invalidar la clave ${key}:`,
      error,
    );
  }
}
