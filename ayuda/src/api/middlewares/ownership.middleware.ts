// middlewares/ownership.middleware.ts
import { NextFunction, Response } from 'express';

import { ShopService, UserService } from '../../services';
import { AuthenticatedRequest } from '../../shared/types';

export const isDeckOwner = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { deckId } = req.params;
    const normalizedDeckId = Array.isArray(deckId) ? deckId[0] : deckId;

    if (!normalizedDeckId) {
      res.status(400).json({ message: 'El ID del mazo es requerido.' });
      return;
    }

    const deck = await UserService.getDeckById(normalizedDeckId);

    if (!deck) {
      res.status(404).json({ message: 'Mazo no encontrado.' });
      return;
    }

    const userDecks = await UserService.getUserDecks(userId);
    const safeUserDecks = userDecks ?? [];
    const isOwner = safeUserDecks.some((userDeck) => userDeck.id === deck.id);

    // Validación de propiedad
    if (!isOwner) {
      res
        .status(403)
        .json({ message: 'No tienes permiso para acceder a este recurso.' });
      return;
    }

    // Guardamos el mazo en el objeto request para no tener que buscarlo
    // otra vez en el controlador (ahorro de recursos)
    (req as any).deck = deck;

    next();
  } catch (error) {
    res.status(500).json({ message: 'Error en la validación de propiedad.' });
  }
};

export const hasCardsInCollection = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { cardIds } = req.body;

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      res
        .status(400)
        .json({ message: 'La lista de cartas es inválida o está vacía.' });
      return;
    }

    // Obtenemos las cartas que el usuario posee realmente
    const ownedCards = await UserService.getUserCards(userId);
    const safeOwnedCards = ownedCards ?? [];

    // Creamos un Set o un Map para que la búsqueda sea ultra rápida O(1)
    const ownedCardIds = new Set(safeOwnedCards.map((c) => c.cardId));

    // Verificamos si CADA carta enviada está en su colección
    const missingCards = cardIds.filter((id) => !ownedCardIds.has(id));

    if (missingCards.length > 0) {
      res.status(403).json({
        message: 'No posees todas las cartas que intentas añadir al mazo.',
        missingCards,
      });
      return;
    }

    // Si todo está bien, pasamos al siguiente paso
    next();
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al validar la propiedad de las cartas.' });
  }
};

export const checkItemNotOwned = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { itemId } = req.body;
    const normalizedItemId = Array.isArray(itemId) ? itemId[0] : itemId;

    if (typeof normalizedItemId !== 'string' || normalizedItemId.length === 0) {
      res.status(400).json({ message: 'El ID del artículo es inválido.' });
      return;
    }

    // Verificar si el usuario ya posee el artículo (mazo temático o cosmético)
    const isOwned = await ShopService.checkOwnership(userId, normalizedItemId);

    if (isOwned) {
      res.status(400).json({
        message:
          'Transacción rechazada: Ya posees este artículo en tu inventario o colección.',
      });
      return;
    }

    // Si no lo posee, permitir que la compra continúe
    next();
  } catch (error) {
    console.error('Error in checkItemNotOwned:', error);
    res.status(500).json({
      message: 'Error interno al verificar la propiedad del artículo.',
    });
  }
};

export const isBoardOwner = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { boardId } = req.body;

    if (!boardId) {
      res.status(400).json({ message: 'El ID del tablero es requerido.' });
      return;
    }

    const boards = await UserService.getUserPurchasedBoards(userId);
    const ownedBoard = Array.isArray(boards)
      ? boards.find((board) => board.id === boardId)
      : null;

    if (!ownedBoard) {
      res.status(403).json({ message: 'No tienes este tablero comprado.' });
      return;
    }

    (req as any).board = ownedBoard;

    next();
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error en la validación de propiedad del tablero.' });
  }
};
