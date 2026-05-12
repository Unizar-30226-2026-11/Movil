// controllers/shop.controller.ts
import { Response } from 'express';

import { ShopService } from '../../services/shop.service';
import { ID_PREFIXES } from '../../shared/constants/id-prefixes';
import { AuthenticatedRequest } from '../../shared/types';
import { LockManager } from '../../shared/utils/lockManager';

export const getShopItems = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const rawId = req.user!.id;
  const userId = parseInt(rawId.replace(ID_PREFIXES.USER, ''));

  if (isNaN(userId)) {
    res.status(400).json({ message: 'Usuario no válido.' });
    return;
  }

  try {
    // Obtener el catálogo disponible en la tienda
    const items = await ShopService.getAvailableItems(userId);

    res.status(200).json({ items });
  } catch (error) {
    console.error('Error in getShopItems:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener los artículos de la tienda.' });
  }
};

export const buyItem = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const userId = req.user!.id;
  const { itemId } = req.body;

  // INTENTAR ADQUIRIR EL LOCK
  const lockAcquired = LockManager.acquire(userId);

  if (!lockAcquired) {
    res.status(409).json({
      message: 'Hay una transacción en curso. Por favor, espera un momento.',
    });
    return;
  }

  try {
    // Delegamos toda la lógica de validación y compra al servicio
    const result = await ShopService.processPurchase(userId, itemId);

    res.status(200).json({
      message: `Has comprado '${result.itemName}' exitosamente.`,
      updatedBalance: result.updatedEconomy,
    });
  } catch (error: any) {
    // Manejamos los errores lanzados por el servicio
    if (error.status) {
      res.status(error.status).json({
        message: error.message,
        ...(error.required && { required: error.required }),
        ...(error.currentBalance && { currentBalance: error.currentBalance }),
      });
    } else {
      console.error('Error in buyItem:', error);
      res.status(500).json({ message: 'Error interno en la transacción.' });
    }
  } finally {
    // LIBERAR EL LOCK SIEMPRE (Garantizado por el finally)
    LockManager.release(userId);
  }
};
