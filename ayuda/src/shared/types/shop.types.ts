// src/shared/types/shop.types.ts
import { Board_Type, Rarity } from '@prisma/client';

export interface DailyShopCard {
  id_card: number;
  title: string;
  rarity: Rarity;
  price: number;
}

export interface DailyShopCollection {
  id_collection: number;
  name: string;
  price: number;
}

export interface DailyShopPack {
  name: string;
  card_ids: number[];
  description: string;
  price: number;
}

export interface DailyShopBoard {
  name: Board_Type;
  price: number;
}

export interface DailyShopState {
  singleCards: DailyShopCard[];
  cardPackOffer: DailyShopPack | null;
  collectionOffer: DailyShopCollection | null;
  boardOffer: DailyShopBoard | null;
  expiresAt: string;
}
