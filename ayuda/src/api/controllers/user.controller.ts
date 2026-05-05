// controllers/user.controller.ts
import { Response } from 'express';

import { UserService } from '../../services';
import { AuthenticatedRequest } from '../../shared/types';

export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id; // El middleware garantiza que req.user existe
    const userProfile = await UserService.getUserProfile(userId);

    if (!userProfile) {
      res.status(404).json({ message: 'Perfil de usuario no encontrado.' });
      return;
    }

    res.status(200).json({ profile: userProfile });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al obtener el perfil del usuario.' });
  }
};

export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { username } = req.body;

    const updatedUser = await UserService.updateUserProfile(userId, username);

    if (!updatedUser) {
      res.status(404).json({ message: 'Usuario no encontrado.' });
      return;
    }

    res.status(200).json({
      message: 'Nombre de usuario actualizado.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error al actualizar el perfil.' });
  }
};

export const updateStatus = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status } = req.body;

    // El servicio se encarga de persistir el estado y notificar vía WebSockets si es necesario
    await UserService.updatePresence(userId, status);

    res.status(200).json({
      message: `Ahora tu estado es: ${status}`,
      status,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cambiar el estado de presencia.' });
  }
};

export const deleteUser = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;

    await UserService.deleteUser(userId);

    res.status(200).json({ message: 'Cuenta eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error interno al eliminar el usuario.' });
  }
};

export const getBalance = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const balance = await UserService.getUserEconomy(userId);

    res.status(200).json({ balance: balance!.balance });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el balance monetario.' });
  }
};

export const searchUsers = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const searchQuery = req.query.q as string;

    if (!searchQuery) {
      res
        .status(400)
        .json({ message: 'Debe proporcionar un parámetro de búsqueda "q".' });
      return;
    }

    // Búsqueda en la base de datos (simulada)
    const results = await UserService.searchUsers(searchQuery);

    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ message: 'Error al buscar usuarios.' });
  }
};

export const getOwnedCards = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const ownedCards = await UserService.getUserCards(userId);

    res.status(200).json({ cards: ownedCards });
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener la colección de cartas del usuario.',
    });
  }
};

export const getUserDecks = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const decks = await UserService.getUserDecks(userId);

    res.status(200).json({ decks });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al obtener los mazos del usuario.' });
  }
};

export const createDeck = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, cardIds } = req.body;

    const newDeck = await UserService.createDeck(userId, name, cardIds);
    res
      .status(201)
      .json({ message: 'Mazo creado exitosamente.', deck: newDeck });
  } catch (error) {
    res.status(500).json({ message: 'Error interno al crear el mazo.' });
  }
};

export const updateDeck = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const { deckId } = req.params;
    const { name, cardIds } = req.body;

    const updatedDeck = await UserService.updateDeck(deckId, name, cardIds);
    res.status(200).json({ message: 'Mazo actualizado.', deck: updatedDeck });
  } catch (error) {
    res.status(500).json({ message: 'Error interno al actualizar.' });
  }
};

export const deleteDeck = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const { deckId } = req.params;

    // El middleware garantizó que es su mazo
    await UserService.deleteDeck(deckId);
    res.status(200).json({ message: 'Mazo eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el mazo.' });
  }
};

export const getPurchasedBoards = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const purchasedBoards = await UserService.getUserPurchasedBoards(userId);

    res.status(200).json({ boards: purchasedBoards });
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener los tableros comprados del usuario.',
    });
  }
};

export const selectActiveBoard = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { boardId } = req.body;

    const result = await UserService.setUserActiveBoard(userId, boardId);

    res.status(200).json({
      message: 'Tablero seleccionado correctamente.',
      activeBoard: result,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al seleccionar el tablero.' });
  }
};
