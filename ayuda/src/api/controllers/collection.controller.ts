// controllers/collection.controller.ts
import { Response } from 'express';

import { CollectionService } from '../../services';
import { AuthenticatedRequest } from '../../shared/types';

export const getCollections = async (
  _req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    // Obtener la metadata de todas las expansiones y sets disponibles en el juego
    const collections = await CollectionService.getAllCollections();

    res.status(200).json({ collections });
  } catch (error) {
    console.error('Error in getCollections:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener la lista de colecciones.' });
  }
};

export const getCardsByCollection = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const { collectionId } = req.params;

    // Verificar que la colección exista primero
    const collectionExists =
      await CollectionService.getCollectionById(collectionId);

    if (!collectionExists) {
      res.status(404).json({ message: 'La colección especificada no existe.' });
      return;
    }

    // Obtener el catálogo completo de cartas que pertenecen a esta colección
    const cards = await CollectionService.getCardsByCollection(collectionId);

    res.status(200).json({
      collection: collectionExists,
      cards,
    });
  } catch (error) {
    console.error('Error in getCardsByCollection:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener las cartas de la colección.' });
  }
};
