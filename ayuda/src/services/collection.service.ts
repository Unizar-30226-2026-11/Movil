import { prisma } from '../infrastructure/prisma';
import { ID_PREFIXES } from '../shared/constants/id-prefixes';
import {
  getCachedData,
  getCachedItem,
  setCachedData,
} from '../shared/utils/cache.utils';

export const CollectionService = {
  // Obtiene todas las colecciones disponibles
  getAllCollections: async () => {
    return getCachedData(
      'cache:collections:all',
      async () => {
        const collections = await prisma.collection.findMany({
          include: {
            _count: {
              select: { cards: true },
            },
          },
        });

        if (collections == null) return null;

        const mappedCollections = collections.map((collection) => ({
          id: `${ID_PREFIXES.COLLECTION}${collection.id_collection}`,
          name: collection.name,
          description: collection.description,
          release_date: collection.releaseDate.toISOString(),
          total_cards: collection._count.cards,
        }));

        return { collections: mappedCollections };
      },
      86400,
    ); // 24 horas (86400s)
  },

  // Busca una (o unas) coleccion específica por su ID
  getCollectionById: async (col_ids: string | string[]) => {
    const isArrayInput = Array.isArray(col_ids);
    const idsToProcess = isArrayInput ? col_ids : [col_ids];

    const numericIds = idsToProcess.map((id) =>
      parseInt(id.replace(ID_PREFIXES.COLLECTION, '')),
    );

    const finalCollections: any[] = [];
    const missingIdsInCache: number[] = [];

    for (const id of numericIds) {
      const cacheKey = `cache:collection:id:${id}`;
      const cached = await getCachedItem<any>(cacheKey);

      if (cached) finalCollections.push(cached);
      else missingIdsInCache.push(id);
    }

    if (missingIdsInCache.length == 0) {
      return idsToProcess.length > 1
        ? { collections: finalCollections }
        : finalCollections[0];
    }

    const bbddCollections = await prisma.collection.findMany({
      where: {
        id_collection: { in: missingIdsInCache }, // Solo se buscan los que no estaban ya en caché
      },
      include: {
        _count: {
          select: { cards: true },
        },
      },
    });

    if (bbddCollections.length > 0) {
      for (const collection of bbddCollections) {
        const formattedCollection = {
          id: `${ID_PREFIXES.COLLECTION}${collection.id_collection}`,
          name: collection.name,
          description: collection.description,
          releaseDate: collection.releaseDate.toISOString(),
          totalCards: collection._count.cards,
        };

        const cacheKey = `cache:collection:id:${collection.id_collection}`;

        await setCachedData(cacheKey, formattedCollection, 86400);

        finalCollections.push(formattedCollection);
      }
    }

    if (finalCollections.length === 0) return null;

    // Si pedimos más de uno, devolvemos el objeto con el array.
    // Si solo pedimos uno, devolvemos el objeto directo.
    return idsToProcess.length > 1
      ? { collections: finalCollections }
      : finalCollections[0];
  },

  // Obtiene el catálogo de cartas de una (o unas) colección
  getCardsByCollection: async (col_ids: string | string[]) => {
    const isArrayInput = Array.isArray(col_ids);
    const idsToProcess = isArrayInput ? col_ids : [col_ids];

    const numericIds = idsToProcess
      .map((id) => parseInt(id.replace(ID_PREFIXES.COLLECTION, '')))
      .filter((id) => !isNaN(id));

    if (numericIds.length === 0) return null;

    const finalCatalogs: any[] = [];
    const missingIdsInCache: number[] = [];

    for (const id of numericIds) {
      const cacheKey = `cache:collection:cards:${id}`;
      const cached = await getCachedItem<any>(cacheKey);

      if (cached) {
        finalCatalogs.push(cached);
      } else {
        missingIdsInCache.push(id);
      }
    }

    if (missingIdsInCache.length === 0) {
      return finalCatalogs;
    }

    // Buscamos la colección e incluimos su lista de cartas genéricas
    const bbddCollections = await prisma.collection.findMany({
      where: {
        id_collection: { in: missingIdsInCache },
      },
      include: { cards: true },
    });

    if (bbddCollections.length > 0) {
      for (const collection of bbddCollections) {
        const collection_id = `${ID_PREFIXES.COLLECTION}${collection.id_collection}`;

        const formattedCatalog = {
          collection: {
            id: collection_id,
            name: collection.name,
          },
          cards: collection.cards.map((card) => ({
            id: `${ID_PREFIXES.CARD}${card.id_card}`,
            name: card.title,
            rarity: card.rarity,
            url_image: card.url_image,
          })),
        };

        const cacheKey = `cache:collection:cards:${collection.id_collection}`;

        await setCachedData(cacheKey, formattedCatalog, 86400); // 24 Horas

        finalCatalogs.push(formattedCatalog);
      }
    }

    if (finalCatalogs.length === 0) {
      return null;
    }

    // Si pedimos más de uno, devolvemos el objeto con el array.
    // Si solo pedimos uno, devolvemos el objeto directo.
    return idsToProcess.length > 1
      ? { collections: finalCatalogs }
      : finalCatalogs[0];
  },
};
