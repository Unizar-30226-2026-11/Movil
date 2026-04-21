// shared/constants/rewards.ts
// Monedas que se reparten al finalizar una partida, según el puesto del jugador.
// Ajustar los valores cuando se definan los precios finales de la tienda.

export const COIN_REWARDS_BY_RANK: Record<number, number> = {
  1: 50, // Ganador
  2: 35,
  3: 25,
  4: 15,
};

/** Recompensa para el 5.º puesto en adelante */
export const COIN_REWARDS_DEFAULT = 10;
