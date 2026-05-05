// src/infrastructure/redis.ts
import dotenv from 'dotenv';
import { createClient } from 'redis';

dotenv.config();

const redisUrlString = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: redisUrlString,
});

const parsedUrl = new URL(redisUrlString);
export const bullmqConnection = {
  host: parsedUrl.hostname || 'localhost',
  port: parseInt(parsedUrl.port || '6379', 10),
  username: parsedUrl.username || undefined,
  password: parsedUrl.password || undefined,
};

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisClient.on('connect', () =>
  console.log('✅ Redis conectado correctamente'),
);

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};
