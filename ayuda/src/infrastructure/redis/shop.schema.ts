// src/shared/types/shop.schema.ts
import { Repository, Schema } from 'redis-om';

import { redisClient } from '../redis';

export const DailyShopSchema = new Schema(
  'daily-shop',
  {
    // Guardamos los arrays y objetos como strings (JSON) para mantener la estructura compleja
    singleCards: { type: 'string' }, // Array de objetos de cartas
    cardPackOffer: { type: 'string' }, // Objeto de la oferta del sobre
    collectionOffer: { type: 'string' }, // Objeto de la colección
    boardOffer: { type: 'string' }, // Objeto del tablero
    expiresAt: { type: 'string' }, // Fecha de expiración en formato ISO
  },
  {
    dataStructure: 'JSON',
  },
);

// Usamos el cliente real para evitar errores en runtime
export const shopRepository = new Repository(
  DailyShopSchema,
  redisClient as any,
);
