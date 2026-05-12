// middlewares/validators.middleware.ts
import { User_States } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';

import {
  ID_PREFIXES,
  ID_SAFE_REGEX,
  LOBBY_CODE_REGEX,
  LOBBY_MAX_PLAYERS,
  LOBBY_MIN_PLAYERS,
} from '../../shared/constants';
import { AuthenticatedRequest } from '../../shared/types';
import { normalizeGameMode } from '../../shared/utils';

// Mapa interno para saber qué prefijo corresponde a cada parámetro
const PARAM_PREFIX_MAP: Record<string, string> = {
  userId: ID_PREFIXES.USER,
  friendId: ID_PREFIXES.USER,
  targetUserId: ID_PREFIXES.USER,
  requestId: ID_PREFIXES.REQ,
  collectionId: ID_PREFIXES.COLLECTION,
  deckId: ID_PREFIXES.DECK,
};

export const validateDeckBody = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { name, cardIds } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({
      message: 'El nombre del mazo es obligatorio y debe ser un texto.',
    });
    return;
  }

  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    res
      .status(400)
      .json({ message: 'El mazo debe contener al menos una carta.' });
    return;
  }

  next();
};

export const validateBuyItemBody = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const { itemId } = req.body;

    // Verificar que el itemId exista y sea de tipo string
    if (!itemId || typeof itemId !== 'string' || itemId.trim() === '') {
      res.status(400).json({
        message:
          'El campo "itemId" es obligatorio y debe ser una cadena de texto válida.',
      });
      return;
    }

    // Si todo es correcto, pasar al siguiente middleware o controlador
    next();
  } catch (error) {
    console.error('Error in validateBuyItemBody:', error);
    res
      .status(500)
      .json({ message: 'Error interno al validar la petición de compra.' });
  }
};

/**
 * Función base reutilizable (Fábrica)
 */
const validateId = (
  paramName: string,
  source: 'params' | 'body' = 'params',
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const idValue = req[source][paramName];

    // Validación de existencia y tipo
    if (!idValue || typeof idValue !== 'string') {
      res.status(400).json({
        message: `El campo '${paramName}' es requerido y debe ser un texto.`,
      });
      return;
    }

    // CASO ESPECIAL: Lobby Code (No usa prefijos, usa formato A-Z0-9)
    if (paramName === 'lobbyCode') {
      if (!LOBBY_CODE_REGEX.test(idValue)) {
        res.status(400).json({
          message: `El código de sala debe tener entre 4 y 6 caracteres alfanuméricos en mayúsculas.`,
        });
        return;
      }
      return next();
    }

    // Validación de Prefijos (para IDs normales)
    const expectedPrefix = PARAM_PREFIX_MAP[paramName];
    if (expectedPrefix && !idValue.startsWith(expectedPrefix)) {
      res.status(400).json({
        message: `Formato inválido. '${paramName}' debe comenzar con '${expectedPrefix}'.`,
      });
      return;
    }

    // Validación de caracteres permitidos
    if (!ID_SAFE_REGEX.test(idValue)) {
      res.status(400).json({
        message: `El campo '${paramName}' contiene caracteres no permitidos.`,
      });
      return;
    }

    next();
  };
};

// Valida parámetros en la URL como :userId, :deckId, etc.
export const validateIdParam = (paramName: string) =>
  validateId(paramName, 'params');
export const validateIdBody = (paramName: string) =>
  validateId(paramName, 'body');

// Valida específicamente el cuerpo al enviar solicitud
export const validateSendRequestBody = validateId('targetUserId', 'body');

/**
 * Valida el cuerpo de la petición al responder a una solicitud de amistad.
 */
export const validateRespondRequestBody = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const { action } = req.body;
    const validActions = ['accept', 'reject'];

    if (!action || !validActions.includes(action)) {
      res.status(400).json({
        message: `La acción debe ser: ${validActions.join(' o ')}.`,
      });
      return;
    }
    next();
  } catch (error) {
    console.error('Error in validateRespondRequestBody:', error);
    res.status(500).json({
      message: 'Error interno al validar la respuesta de la solicitud.',
    });
  }
};

/**
 * Valida el cuerpo complejo al crear un nuevo lobby
 */
export const validateCreateLobbyBody = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { name, maxPlayers, engine, isPrivate } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ message: 'El nombre de la sala es obligatorio.' });
    return;
  }

  if (
    typeof maxPlayers !== 'number' ||
    maxPlayers < LOBBY_MIN_PLAYERS ||
    maxPlayers > LOBBY_MAX_PLAYERS
  ) {
    res.status(400).json({
      message: `El número de jugadores debe ser entre ${LOBBY_MIN_PLAYERS} y ${LOBBY_MAX_PLAYERS}.`,
    });
    return;
  }

  if (!normalizeGameMode(engine)) {
    res.status(400).json({
      message:
        'El motor debe ser uno de estos valores: "Classic", "Stella", "STANDARD" o "STELLA".',
    });
    return;
  }

  if (typeof isPrivate !== 'boolean') {
    res.status(400).json({ message: 'El campo isPrivate debe ser booleano.' });
    return;
  }

  next();
};

/**
 * Valida el cuerpo de la petición al actualizar el nombre de usuario.
 */
export const validateUsernameBody = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { username } = req.body;
  const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

  // Verificación de existencia y tipo
  if (!username || typeof username !== 'string') {
    res.status(400).json({
      message: 'El nombre de usuario es obligatorio y debe ser un texto.',
    });
    return;
  }

  const trimmedUsername = username.trim();

  // Verificación de formato y longitud (3-20 caracteres, alfanumérico)
  if (!USERNAME_REGEX.test(trimmedUsername)) {
    res.status(400).json({
      message:
        'El nombre de usuario debe tener entre 3 y 20 caracteres y solo contener letras, números o guiones bajos.',
    });
    return;
  }

  // Actualizamos el body con el valor limpio
  req.body.username = trimmedUsername;
  next();
};

export const validateStatusBody = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { status } = req.body;

  if (!status || !Object.values(User_States).includes(status)) {
    res.status(400).json({
      message: `Estado no válido. Opciones: ${Object.values(User_States).join(', ')}`,
    });
    return;
  }
  next();
};
