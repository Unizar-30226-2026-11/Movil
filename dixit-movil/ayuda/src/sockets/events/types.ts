// src/sockets/events/types.ts

// --- TIPOS DE SUBIDA (Payloads del Cliente) ---

export interface JoinLobbyPayload {
  lobbyCode: string;
}

export interface LobbyStartPayload {
  useDynamicPool?: boolean;
}

export interface ChatSendPayload {
  lobbyCode: string;
  text: string;
}

// El payload maestro para la máquina de estados
export interface GameActionPayload {
  lobbyCode: string;
  actionType: 'SUBMIT_STORY' | 'PLAY_CARD' | 'VOTE_CARD' | 'USE_POWERUP';
  data: any; // Aquí vendría el ID de la carta, la pista, etc.
}

// --- TIPOS DE BAJADA (Payloads del Servidor) ---

export interface ChatMessageReceivedPayload {
  username: string;
  text: string;
  timestamp: string;
}
export interface GameStartedPayload {
  state: any;
}

export interface PrivateHandPayload {
  hand: number[];
}

export interface DuelAvailablePayload {
  challengerId: any;
}

export interface SpecialEventPayload {
  pId: any;
  effect: string;
  amount: number;
}

export interface MinigameStartPayload {
  player1: any;
  player2: any;
  type: number;
  duration: number;
  isDuel: boolean;
}

export interface GameStateUpdatedPayload {
  // Aquí importarías tu GameState (el JSON que guardamos en Redis)
  state: any;
  lastAction?: string; // Opcional: para que el frontend sepa qué provocó el cambio
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface GameErrorPayload {
  message: string;
}

export interface SessionRecoveredPayload {
  lobbyCode: string;
  state: any; // Aquí va el estado del juego (gameState)
}

export interface LobbyRecoveredPayload {
  lobbyCode: string;
  lobby: any; // Aquí va el estado del lobby
}
