import { gameRepository } from '../infrastructure/redis/game.schema';
import { GameState } from '../shared/types';

export const GameRedisRepository = {
  /**
   * Recupera el estado de la partida e "hidrata" los campos JSON.
   */
  async getGame(lobbyCode: string): Promise<GameState | null> {
    const data = await gameRepository.fetch(lobbyCode);

    // Si el objeto recuperado no tiene ID, es que no existe en Redis
    if (!data || !data.lobbyCode) return null;

    // Convertimos los strings de Redis en los tipos reales de TS
    return {
      ...data,
      players: data.players as string[],
      disconnectedPlayers: data.disconnectedPlayers as string[],
      // Parseo de seguridad con fallback a objeto vacío si falla
      scores: JSON.parse((data.scores as string) || '{}'),
      hands: JSON.parse((data.hands as string) || '{}'),
      centralDeck: JSON.parse((data.centralDeck as string) || '[]'),
      discardPile: JSON.parse((data.discardPile as string) || '[]'),
      currentRound: JSON.parse((data.currentRound as string) || '{}'),
      cardUrls: JSON.parse((data.cardUrls as string) || '{}'),
      boardRegistry: JSON.parse((data.boardRegistry as string) || '{}'),
      activeConflict: JSON.parse((data.activeConflict as string) || 'null'),
    } as unknown as GameState;
  },

  /**
   * "Deshidrata" el GameState convirtiendo objetos a strings para Redis.
   */
  async saveGame(lobbyCode: string, state: GameState): Promise<void> {
    await gameRepository.save(lobbyCode, {
      ...state,
      // Serializamos los objetos complejos antes de guardar
      scores: JSON.stringify(state.scores),
      hands: JSON.stringify(state.hands),
      centralDeck: JSON.stringify(state.centralDeck),
      discardPile: JSON.stringify(state.discardPile),
      currentRound: JSON.stringify(state.currentRound),
      cardUrls: JSON.stringify(state.cardUrls || {}),
      boardRegistry: JSON.stringify(state.boardRegistry),
      activeConflict: JSON.stringify(state.activeConflict ?? null),
    });
  },

  /**
   * Elimina la partida de Redis (útil al finalizar).
   */
  async deleteGame(lobbyCode: string): Promise<void> {
    await gameRepository.remove(lobbyCode);
  },

  /**
   * Obtiene todos los IDs de partidas que no han finalizado.
   * Requiere que el campo 'phase' esté indexado como 'string' en game.schema.ts
   */
  async getAllActiveLobbies(): Promise<string[]> {
    const activeGames = await gameRepository
      .search()
      .where('phase')
      .not.equalTo('FINISHED')
      .return.all();

    // Usamos .lobbyCode porque es como se llama en tu gameStateSchema
    return activeGames.map((game) => game.lobbyCode as string);
  },
};
