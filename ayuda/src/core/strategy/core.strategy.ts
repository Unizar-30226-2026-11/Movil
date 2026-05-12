import { GameAction, GameState } from '../../shared/types';

/**
 * Contrato que deben cumplir todos los modos de juego (Estrategias).
 * El motor principal delegará la ejecución de la lógica a la clase
 * que implemente esta interfaz.
 */
export interface GameModeStrategy {
  /**
   * Procesa una acción del juego y devuelve el nuevo estado inmutable.
   * Cada estrategia se encarga de procesar las acciones que le corresponden
   * y lanzar errores si recibe una acción incompatible con su modo.
   * * @param state El estado completo de la partida en el momento de la acción.
   * @param action La acción enviada por el jugador o el sistema.
   * @returns El nuevo estado modificado según las reglas del modo activo.
   */
  transition(state: GameState, action: GameAction): GameState;

  /**
   * Prepara el estado para la siguiente ronda según las reglas del modo.
   * Este método es vital para el "hot-swap" (cambio en caliente), ya que
   * se llama tanto al avanzar de ronda normalmente, como al cambiar a
   * este modo desde un modo distinto.
   * * @param state El estado de la partida justo antes de empezar la nueva ronda.
   * @returns El estado listo para comenzar a jugar en el modo correspondiente.
   */
  handleNextRound(state: GameState): GameState;
}
