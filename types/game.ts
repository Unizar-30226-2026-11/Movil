export type SocketEventHandler<T = unknown> = (payload: T) => void;

export type GenericGameState = {
  id?: string;
  gameId?: string;
  lobbyCode?: string;
  mode?: string;
  status?: string;
  phase?: string;
  turnOf?: string;
  timer?: number;
  players?: string[];
  disconnectedPlayers?: string[];
  playerNames?: Record<string, string>;
  winners?: string[];
  scores?: Record<string, number>;
  cardUrls?: Record<string, string>;
  currentRound?: {
    storytellerId?: string;
    clue?: string | null;
    storytellerCardId?: number | null;
    playedCards?: Record<string, number>;
    boardCards?: number[];
    boardCardsDetailed?: {
      id?: string | number;
      id_card?: string | number;
      cardId?: string | number;
      url_image?: string | null;
      [key: string]: unknown;
    }[];
    selectedVoteCardId?: number | null;
    votes?: { voterId: string; targetCardId: number }[];
    [key: string]: unknown;
  };
  isStarActive?: boolean;
  starExpiresAt?: number;
  isMinigameActive?: boolean;
  activeConflict?: {
    player1: string;
    player2: string;
    isDuel: boolean;
    type?: 0 | 1 | 2;
    duration?: number;
  } | null;
  boardRegistry?: Record<number, string[]>;
  activeModifiers?: Record<string, unknown>;
  board?: {
    id?: string;
    name?: string;
    url_image?: string;
    tiles?: {
      index?: number;
      type?: string;
      value?: number;
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GameConflictPayload = {
  player1: string;
  player2: string;
  type: 0 | 1 | 2;
  duration: number;
  isDuel: boolean;
};

export type GameSessionRecoveredPayload = {
  lobbyCode: string;
  state: GenericGameState;
};

export type GameStartedPayload = {
  state: GenericGameState;
  board?: {
    id: string;
    name: string;
    url_image: string;
  };
};

export type GameStateUpdatedPayload = {
  state: GenericGameState;
  lastAction?: unknown;
};

export type GameRankingEntry = {
  playerId: string;
  points: number;
  place: number;
  coinsEarned: number;
};

export type GameEndedPayload = {
  ranking: GameRankingEntry[];
  error?: string;
};

export type GameSpecialEventPayload = {
  pId?: string;
  effect?: string;
  amount?: number;
  points?: number;
  squareId?: number;
  targetId?: string;
  message?: string;
  [key: string]: unknown;
};

export type GameModeChangeOfferPayload = {
  message?: string;
  targetMode?: 'STANDARD' | 'STELLA' | string;
};

export type GameStarPayload = {
  starId: string;
  duration: number;
  path?: {
    start?: { x: number; y: number };
    end?: { x: number; y: number };
  };
  [key: string]: unknown;
};

export type GameStarClaimedPayload = {
  winnerId: string;
  newScores?: Record<string, number>;
  [key: string]: unknown;
};

export type LobbyState = {
  lobbyCode: string;
  hostId: string;
  name: string;
  maxPlayers: number;
  engine: 'STANDARD' | 'STELLA';
  isPrivate: boolean;
  status: 'waiting' | 'playing';
  players: string[];
};
