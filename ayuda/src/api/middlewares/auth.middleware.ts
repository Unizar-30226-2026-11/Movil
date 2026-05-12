// middlewares/auth.middleware.ts
import { NextFunction, Response } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { AuthenticatedRequest } from '../../shared/types';

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  try {
    // Extraer el header de autorización
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        message: 'Acceso denegado. Token no proporcionado o formato inválido.',
      });
      return;
    }

    // Extraer el token (ignorando la palabra "Bearer")
    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ message: 'Acceso denegado. Token ausente.' });
      return;
    }

    // Verificar el token usando la clave secreta
    const secretKey = process.env.JWT_SECRET || 'super_secret_fallback_key';
    const decodedPayload = jwt.verify(token, secretKey) as {
      id: string;
      username: string;
      activeGameId?: string | null;
    };

    // Adjuntar el payload decodificado al objeto request
    req.user = {
      id: decodedPayload.id,
      username: decodedPayload.username,
      activeGameId: decodedPayload.activeGameId || null, //ID de la partida si está jugando
    };

    // Continuar con el siguiente middleware o controlador
    next();
  } catch (error) {
    // Manejo específico de errores de JWT
    if (error instanceof TokenExpiredError) {
      res.status(401).json({
        message: 'El token ha expirado. Por favor, inicie sesión nuevamente.',
      });
      return;
    }

    if (error instanceof JsonWebTokenError) {
      res.status(401).json({ message: 'Token inválido o malformado.' });
      return;
    }

    // Cualquier otro error inesperado
    res.status(500).json({ message: 'Error interno al autenticar el token.' });
    return;
  }
};
