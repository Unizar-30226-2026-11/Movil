import 'dotenv/config';

import { prisma } from '../../infrastructure/prisma';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';
import { CollectionService } from '../collection.service';

describe('CollectionService - Pruebas Funciones', () => {
  let id_colection_test: number;
  let real_collection_with_cards_id: string; // Variable dinámica para el test real

  beforeAll(async () => {
    // Por si falla el test y no se borra la coleccion de una ejecución anterior.
    await prisma.collection.deleteMany({
      where: { name: 'Coleccion_Test' },
    });

    const colection_test = await prisma.collection.create({
      data: {
        name: 'Coleccion_Test',
        description:
          'Esta es solamente una coleccion temporal que vive en los test',
      },
    });

    id_colection_test = colection_test.id_collection;

    // Buscamos una coleccion con cartas
    const realCollection = await prisma.collection.findFirst({
      where: {
        cards: { some: {} }, // al menos una carta
      },
    });

    if (!realCollection) {
      throw new Error(
        'No hay colecciones con cartas en la BD. Ejecuta el seed.',
      );
    }

    // Guardamos su ID dinámico (ej: 'col_14')
    real_collection_with_cards_id = `${ID_PREFIXES.COLLECTION}${realCollection.id_collection}`;
  });

  beforeEach(() => {});

  test('Obtener todas las colecciones. -> getAllCollections() ', async () => {
    const resultado = await CollectionService.getAllCollections();

    expect(resultado).toBeDefined();
    expect(resultado?.collections).toBeInstanceOf(Array);

    resultado?.collections.forEach((card) => {
      expect(card).toEqual({
        id: expect.stringMatching(
          new RegExp(`^${ID_PREFIXES.COLLECTION}\\d+$`),
        ),
        name: expect.stringMatching(/.+/),
        description: card.description === null ? null : expect.any(String),
        release_date: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        ), // Formato ISOString
        total_cards: expect.any(Number),
      });
    });
  });

  describe('Obtener coleccion por ID. -> getCollectionById() ', () => {
    test('Colección única (debe devolver objeto directo por lógica de length)', async () => {
      const id_col = `${ID_PREFIXES.COLLECTION}${id_colection_test}`;

      // Al pasar solo uno (aunque sea en array de 1), tu lógica de .length devolverá el objeto
      const resultado = await CollectionService.getCollectionById([id_col]);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe(id_col);
      expect(resultado.name).toBe('Coleccion_Test');
      expect(resultado.totalCards).toBeDefined(); // Verificamos camelCase según tu service
    });

    test('Múltiples colecciones (debe devolver objeto con array por lógica de length)', async () => {
      // Usamos el mismo ID dos veces solo para forzar el length > 1
      const id_col = `${ID_PREFIXES.COLLECTION}${id_colection_test}`;
      const resultado = await CollectionService.getCollectionById([
        id_col,
        id_col,
      ]);

      expect(resultado.collections).toBeDefined();
      expect(resultado.collections).toBeInstanceOf(Array);
      expect(resultado.collections.length).toBeGreaterThan(0);
    });

    test('Colección inexistente.', async () => {
      const id_col = `${ID_PREFIXES.COLLECTION}9999999`;

      const resultado = await CollectionService.getCollectionById(id_col);

      expect(resultado).toBeNull();
    });
  });

  describe('Obtener cartas de una coleccion por ID.  -> getCardsByCollection() ', () => {
    test('Cartas de una Colección existente.', async () => {
      const resultado = await CollectionService.getCardsByCollection(
        real_collection_with_cards_id,
      );

      expect(resultado).toBeDefined();
      if (resultado == null) throw Error('El resultado no deberia ser nulo.');

      const catalog = Array.isArray(resultado) ? resultado[0] : resultado;
      expect(catalog).toEqual(
        expect.objectContaining({
          collection: expect.objectContaining({
            id: real_collection_with_cards_id,
          }),
          cards: expect.any(Array),
        }),
      );

      if (catalog.cards.length > 0) {
        expect(catalog.cards[0]).toMatchObject({
          id: expect.stringMatching(new RegExp(`^${ID_PREFIXES.CARD}\\d+$`)),
          name: expect.any(String),
          rarity: expect.stringMatching(
            /^(COMMON|UNCOMMON|SPECIAL|EPIC|LEGENDARY)$/,
          ),
        });

        expect(catalog.cards[0]).toHaveProperty('url_image');
      }
    });

    test('Cartas de una Colección inexistente.', async () => {
      const id_card = `${ID_PREFIXES.CARD}9999999`;

      const resultado = await CollectionService.getCardsByCollection(id_card);

      expect(resultado).toBeNull();
    });
  });

  afterAll(async () => {
    await prisma.collection.deleteMany({
      where: {
        id_collection: id_colection_test,
      },
    });
  });

  afterEach(() => {});
});
