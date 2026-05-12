import { GameMode } from '../types';

/**
 * Normaliza los valores de modo de juego recibidos desde clientes o lobbies
 * legacy al formato interno que usa el motor.
 */
export const normalizeGameMode = (
  mode: string | null | undefined,
): GameMode | null => {
  if (typeof mode !== 'string') {
    return null;
  }

  switch (mode.trim().toUpperCase()) {
    case 'STANDARD':
    case 'CLASSIC':
      return 'STANDARD';
    case 'STELLA':
      return 'STELLA';
    default:
      return null;
  }
};
