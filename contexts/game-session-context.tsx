import { API_URL, SOCKET_URL } from '@/constants/api';
import {
  GameConflictPayload,
  GameEndedPayload,
  GameModeChangeOfferPayload,
  GameRankingEntry,
  GameSessionRecoveredPayload,
  GameSpecialEventPayload,
  GameStarClaimedPayload,
  GameStarPayload,
  GameStartedPayload,
  GameStateUpdatedPayload,
  GenericGameState,
  LobbyState,
} from '@/types/game';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { io, Socket } from 'socket.io-client';

type RefreshResponse = {
  wsToken?: string;
  lobbyCode?: string | null;
  activeSession?: boolean;
  message?: string;
};

const readJsonSafely = async <T,>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

type WalletUpdatedPayload = {
  balance: number;
};

type GameSessionError = {
  message: string;
  at: number;
};

export type LobbyNotice = {
  id: string;
  kind: 'info' | 'reshuffle' | 'reconnect';
  message: string;
  at: number;
};

export type LobbyChatMessage = {
  id: string;
  username: string;
  text: string;
  timestamp: string;
};

type ConnectLobbyOptions = {
  emitJoin?: boolean;
};

const DISMISSED_ACTIVE_LOBBY_STORAGE_KEY = 'dismissedActiveLobbyCode';

const mergeBoardPayload = (
  previousBoard: GenericGameState['board'] | null | undefined,
  incomingBoard: GenericGameState['board'] | null | undefined,
  overrideBoard?: GameStartedPayload['board'] | null
) => {
  const baseBoard =
    previousBoard && typeof previousBoard === 'object' ? previousBoard : {};
  const nextBoard =
    incomingBoard && typeof incomingBoard === 'object' ? incomingBoard : {};
  const explicitBoard =
    overrideBoard && typeof overrideBoard === 'object' ? overrideBoard : {};

  const merged = {
    ...baseBoard,
    ...nextBoard,
    ...explicitBoard,
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const mergeCardUrlsPayload = (
  previousCardUrls: GenericGameState['cardUrls'] | null | undefined,
  incomingCardUrls: GenericGameState['cardUrls'] | null | undefined
) => {
  const baseUrls =
    previousCardUrls && typeof previousCardUrls === 'object' ? previousCardUrls : {};
  const nextUrls =
    incomingCardUrls && typeof incomingCardUrls === 'object' ? incomingCardUrls : {};

  const merged = {
    ...baseUrls,
    ...nextUrls,
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
};

type GameSessionContextValue = {
  token: string | null;
  activeGameId: string | null;
  currentLobbyCode: string | null;
  lobbyState: LobbyState | null;
  gameState: GenericGameState | null;
  privateHand: (number | Record<string, any>)[];
  duelAvailableFor: string | null;
  activeConflict: GameConflictPayload | null;
  latestSpecialEvent: GameSpecialEventPayload | null;
  modeChangeOffer: GameModeChangeOfferPayload | null;
  activeStar: GameStarPayload | null;
  lastGameError: GameSessionError | null;
  latestLobbyNotice: LobbyNotice | null;
  lobbyChatMessages: LobbyChatMessage[];
  walletBalance: number | null;
  finalRanking: GameRankingEntry[];
  isSocketConnected: boolean;
  emitGameAction: (action: unknown, lobbyCode?: string | null) => boolean;
  claimStar: (playerId: string, lobbyCode?: string | null) => void;
  submitMinigameScore: (score: number, lobbyCode?: string | null) => void;
  submitConflictResult: (
    winnerId: string,
    loserId: string,
    isDuel: boolean,
    lobbyCode?: string | null
  ) => void;
  clearConflict: () => void;
  clearModeChangeOffer: () => void;
  refreshSession: () => Promise<void>;
  reconnectToActiveGame: () => Promise<void>;
  connectToLobbySession: (wsToken: string, lobbyCode: string, options?: ConnectLobbyOptions) => void;
  leaveLobbySession: () => void;
  sendLobbyChatMessage: (text: string, lobbyCode?: string | null) => boolean;
  dismissActiveGame: (lobbyCode?: string | null) => Promise<void>;
  closeActiveGame: (lobbyCode?: string | null) => Promise<void>;
  startLobbyGame: (useDynamicPool?: boolean) => void;
  setActiveGameId: (value: string | null) => void;
};

const GameSessionContext = createContext<GameSessionContextValue | null>(null);

export function GameSessionProvider({ children }: PropsWithChildren) {
  const socketRef = useRef<Socket | null>(null);
  const socketDisabledRef = useRef(false);
  const pendingLobbyJoinRef = useRef(false);
  const missingLobbyCleanupRef = useRef<string | null>(null);
  const currentLobbyCodeRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [currentLobbyCode, setCurrentLobbyCode] = useState<string | null>(null);
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GenericGameState | null>(null);
  const [privateHand, setPrivateHand] = useState<(number | Record<string, any>)[]>([]);
  const [duelAvailableFor, setDuelAvailableFor] = useState<string | null>(null);
  const [activeConflict, setActiveConflict] = useState<GameConflictPayload | null>(null);
  const [latestSpecialEvent, setLatestSpecialEvent] = useState<GameSpecialEventPayload | null>(null);
  const [modeChangeOffer, setModeChangeOffer] = useState<GameModeChangeOfferPayload | null>(null);
  const [activeStar, setActiveStar] = useState<GameStarPayload | null>(null);
  const [lastGameError, setLastGameError] = useState<GameSessionError | null>(null);
  const [latestLobbyNotice, setLatestLobbyNotice] = useState<LobbyNotice | null>(null);
  const [lobbyChatMessages, setLobbyChatMessages] = useState<LobbyChatMessage[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [finalRanking, setFinalRanking] = useState<GameRankingEntry[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const updateCurrentLobbyCode = (value: string | null) => {
    currentLobbyCodeRef.current = value;
    setCurrentLobbyCode(value);
  };

  const clearConflict = () => {
    setActiveConflict(null);
  };

  const clearModeChangeOffer = () => {
    setModeChangeOffer(null);
  };

  const syncConflictFromState = (state: GenericGameState | null | undefined) => {
    if (state?.isMinigameActive && state.activeConflict) {
      setActiveConflict((previous) => {
        if (
          typeof state.activeConflict?.type === 'number' &&
          typeof state.activeConflict?.duration === 'number'
        ) {
          return {
            player1: state.activeConflict.player1,
            player2: state.activeConflict.player2,
            type: state.activeConflict.type,
            duration: state.activeConflict.duration,
            isDuel: state.activeConflict.isDuel,
          };
        }

        if (
          previous &&
          previous.player1 === state.activeConflict?.player1 &&
          previous.player2 === state.activeConflict?.player2 &&
          previous.isDuel === state.activeConflict?.isDuel
        ) {
          return previous;
        }

        return null;
      });
      return;
    }

    setActiveConflict(null);
  };

  const clearRealtimeState = () => {
    updateCurrentLobbyCode(null);
    setLobbyState(null);
    setGameState(null);
    setPrivateHand([]);
    setDuelAvailableFor(null);
    setActiveConflict(null);
    setLatestSpecialEvent(null);
    setModeChangeOffer(null);
    setActiveStar(null);
    setLastGameError(null);
    setLatestLobbyNotice(null);
    setLobbyChatMessages([]);
    setActiveGameId(null);
    setFinalRanking([]);
  };

  const disconnectSocket = () => {
    if (!socketRef.current) return;
    socketRef.current.disconnect();
    socketRef.current = null;
    setIsSocketConnected(false);
  };

  const emitGameAction = (action: unknown, lobbyCode?: string | null) => {
    if (!socketRef.current || !socketRef.current.connected) return false;
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current;
    if (!resolvedLobbyCode) return false;

    socketRef.current.emit('client:game:action', {
      lobbyCode: resolvedLobbyCode,
      ...(typeof action === 'object' && action !== null ? action : { payload: action }),
    });
    return true;
  };

  const claimStar = (_playerId: string, lobbyCode?: string | null) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current;
    if (!resolvedLobbyCode) return;

    socketRef.current.emit('client:game:claim_star', {
      lobbyCode: resolvedLobbyCode,
    });
  };

  const submitMinigameScore = (score: number, lobbyCode?: string | null) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current;
    if (!resolvedLobbyCode) return;

    socketRef.current.emit('client:game:action', {
      lobbyCode: resolvedLobbyCode,
      actionType: 'SUBMIT_MINIGAME_SCORE',
      payload: { score },
    });
  };

  const submitConflictResult = (
    winnerId: string,
    loserId: string,
    isDuel: boolean,
    lobbyCode?: string | null
  ) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current;
    if (!resolvedLobbyCode) return;

    socketRef.current.emit('client:game:submit_conflict_result', {
      lobbyCode: resolvedLobbyCode,
      winnerId,
      loserId,
      isDuel,
    });
  };

  const startLobbyGame = (useDynamicPool = true) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    socketRef.current.emit('client:lobby:start', { useDynamicPool });
  };

  const pushLobbyNotice = (kind: LobbyNotice['kind'], message: string) => {
    setLatestLobbyNotice({
      id: `${kind}-${Date.now()}`,
      kind,
      message,
      at: Date.now(),
    });
  };

  const sendLobbyChatMessage = (text: string, lobbyCode?: string | null) => {
    if (!socketRef.current || !socketRef.current.connected) return false;
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current;
    const trimmedText = text.trim();
    if (!resolvedLobbyCode || !trimmedText) return false;

    socketRef.current.emit('client:chat:send', {
      lobbyCode: resolvedLobbyCode,
      text: trimmedText,
    });
    return true;
  };

  const resyncActiveRealtimeSession = async () => {
    const storedToken = await AsyncStorage.getItem('userToken');
    if (!storedToken) return;

    try {
      const response = await fetch(`${API_URL}/auth/refresh-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });

      if (!response.ok) return;

      const data = (await response.json()) as RefreshResponse;
      const dismissedLobbyCode = await AsyncStorage.getItem(
        DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
      );
      if (!data.activeSession || !data.wsToken || !data.lobbyCode) return;
      if (dismissedLobbyCode === data.lobbyCode) return;

      socketDisabledRef.current = false;
      missingLobbyCleanupRef.current = null;
      updateCurrentLobbyCode(data.lobbyCode);
      setActiveGameId(data.lobbyCode);
      setToken(data.wsToken);
      connectSocket(data.wsToken);
    } catch {}
  };

  const requestRealtimeResync = (lobbyCode: string) => {
    if (!socketRef.current || !socketRef.current.connected) return;

    socketRef.current.emit('client:game:action', {
      lobbyCode,
      actionType: 'RECONNECT_PLAYER',
      payload: {},
    });
  };

  const isMissingLobbyError = (message: string) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('404') ||
      normalized.includes('lobby_not_found') ||
      normalized.includes('sala no existe') ||
      normalized.includes('sala solicitada no existe') ||
      normalized.includes('no existe o ha expirado') ||
      normalized.includes('partida no encontrada') ||
      normalized.includes('expirada') ||
      normalized.includes('not found')
    );
  };

  const handleRealtimeGameError = (title: string, message: string) => {
    setLastGameError({
      message,
      at: Date.now(),
    });

    if (isMissingLobbyError(message)) {
      const missingLobbyCode = currentLobbyCodeRef.current ?? activeGameId;
      if (missingLobbyCode && missingLobbyCleanupRef.current !== missingLobbyCode) {
        missingLobbyCleanupRef.current = missingLobbyCode;
        void AsyncStorage.setItem(
          DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
          missingLobbyCode,
        );
      }

      socketDisabledRef.current = true;
      setToken(null);
      clearRealtimeState();
      disconnectSocket();
      router.replace('/menu');
      Alert.alert(title, message);
      return;
    }

    if (currentLobbyCodeRef.current) {
      requestRealtimeResync(currentLobbyCodeRef.current);
    }
    void resyncActiveRealtimeSession();
    Alert.alert(title, message);
  };

  const leaveLobbySession = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('client:lobby:leave');
    }
    setToken(null);
    clearRealtimeState();
    disconnectSocket();
  };

  const dismissActiveGame = async (lobbyCode?: string | null) => {
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current ?? activeGameId;
    if (resolvedLobbyCode) {
      await AsyncStorage.setItem(
        DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
        String(resolvedLobbyCode),
      );
    }

    leaveLobbySession();
  };

  const closeActiveGame = async (lobbyCode?: string | null) => {
    const resolvedLobbyCode = lobbyCode ?? currentLobbyCodeRef.current ?? activeGameId;
    const storedToken = await AsyncStorage.getItem('userToken');

    if (!resolvedLobbyCode) {
      await dismissActiveGame(resolvedLobbyCode);
      return;
    }

    const activeSocket = socketRef.current;
    if (activeSocket?.connected && currentLobbyCodeRef.current === resolvedLobbyCode) {
      activeSocket.emit('client:game:end', { lobbyCode: resolvedLobbyCode });
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (activeSocket.connected) {
        activeSocket.emit('client:lobby:leave');
      }
      await dismissActiveGame(resolvedLobbyCode);
      return;
    }

    if (!storedToken) {
      await dismissActiveGame(resolvedLobbyCode);
      return;
    }

    try {
      const joinResponse = await fetch(`${API_URL}/lobbies/${resolvedLobbyCode}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      const joinData = await readJsonSafely<RefreshResponse>(joinResponse);
      if (!joinResponse.ok && joinResponse.status === 404) {
        await dismissActiveGame(resolvedLobbyCode);
        return;
      }

      const response = joinResponse.ok && joinData?.wsToken
        ? null
        : await fetch(`${API_URL}/auth/refresh-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedToken}` },
      });

      const data = response ? await readJsonSafely<RefreshResponse>(response) : joinData;
      if ((response && !response.ok) || !data?.wsToken) {
        await dismissActiveGame(resolvedLobbyCode);
        return;
      }

      await new Promise<void>((resolve) => {
        const closeSocket = io(SOCKET_URL, {
          transports: ['websocket'],
          auth: { token: data.wsToken },
          autoConnect: true,
          reconnection: false,
          timeout: 4000,
        });

        const finish = () => {
          closeSocket.disconnect();
          resolve();
        };

        const timeout = setTimeout(finish, 1200);

        closeSocket.on('connect', () => {
          closeSocket.emit('client:game:end', { lobbyCode: resolvedLobbyCode });
          clearTimeout(timeout);
          setTimeout(() => {
            closeSocket.emit('client:lobby:leave');
            setTimeout(finish, 250);
          }, 350);
        });

        closeSocket.on('connect_error', () => {
          clearTimeout(timeout);
          finish();
        });
      });
    } catch (closeError) {
      console.log('Error cerrando partida:', closeError);
    } finally {
      await dismissActiveGame(resolvedLobbyCode);
    }
  };

  const connectSocket = (wsToken: string) => {
    disconnectSocket();
    if (socketDisabledRef.current) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: wsToken },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1200,
      timeout: 4000,
    });

    socket.on('connect', () => {
      setIsSocketConnected(true);
      if (pendingLobbyJoinRef.current) {
        pendingLobbyJoinRef.current = false;
        socket.emit('client:lobby:join');
      } else if (currentLobbyCodeRef.current) {
        requestRealtimeResync(currentLobbyCodeRef.current);
      }
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
    });

    socket.on('connect_error', (error) => {
      setIsSocketConnected(false);
      const message = String(error?.message ?? '');
      if (message.includes('404')) {
        socketDisabledRef.current = true;
        socket.disconnect();
      }
    });

    socket.on('server:lobby:state_updated', (payload: LobbyState) => {
      const lobbyPlayers = Array.isArray(payload.players) ? payload.players.map(String) : [];
      if (payload.hostId && !lobbyPlayers.includes(String(payload.hostId))) {
        Alert.alert('Sala cerrada', 'El anfitrion ha cerrado la sala.');
        leaveLobbySession();
        router.replace('/menu');
        return;
      }

      setLobbyState(payload);
      updateCurrentLobbyCode(payload.lobbyCode);
    });

    socket.on('server:lobby:recovered', (payload: { lobbyCode: string; lobby: LobbyState }) => {
      updateCurrentLobbyCode(payload.lobbyCode);
      setLobbyState(payload.lobby);
      router.replace({
        pathname: '/main',
        params: { lobbyCode: payload.lobbyCode },
      });
    });

    socket.on('server:lobby:player_reconnected', (payload: { user?: string; message?: string }) => {
      pushLobbyNotice(
        'reconnect',
        payload.message ?? `${payload.user ?? 'Un jugador'} se ha reconectado a la sala.`,
      );
    });

    socket.on('server:session:recovered', (payload: GameSessionRecoveredPayload) => {
      updateCurrentLobbyCode(payload.lobbyCode);
      setActiveGameId(payload.lobbyCode);
      setGameState((previous) => ({
        ...payload.state,
        board: mergeBoardPayload(previous?.board, payload.state.board),
        cardUrls: mergeCardUrlsPayload(previous?.cardUrls, payload.state.cardUrls),
      }));
      syncConflictFromState(payload.state);
      requestRealtimeResync(payload.lobbyCode);
      router.replace({
        pathname: '/gameScreen',
        params: { lobbyCode: payload.lobbyCode },
      });
    });

    socket.on('game:started', ({ lobbyCode }: { lobbyCode: string }) => {
      updateCurrentLobbyCode(lobbyCode);
      setActiveGameId(lobbyCode);
      router.replace({
        pathname: '/gameScreen',
        params: { lobbyCode },
      });
    });

    socket.on('server:game:started', (payload: GameStartedPayload) => {
      const nextLobbyCode = payload.state.lobbyCode ?? currentLobbyCodeRef.current;
      if (nextLobbyCode) {
        updateCurrentLobbyCode(nextLobbyCode);
        setActiveGameId(nextLobbyCode);
      }
      setGameState((previous) => ({
        ...payload.state,
        board: mergeBoardPayload(previous?.board, payload.state.board, payload.board),
        cardUrls: mergeCardUrlsPayload(previous?.cardUrls, payload.state.cardUrls),
      }));
      setFinalRanking([]);
      syncConflictFromState(payload.state);
    });

    socket.on('server:game:state_updated', (payload: GameStateUpdatedPayload) => {
      setGameState((prev) => {
        const nextState = {
          ...payload.state,
          board: mergeBoardPayload(prev?.board, payload.state.board),
          cardUrls: mergeCardUrlsPayload(prev?.cardUrls, payload.state.cardUrls),
        };
        syncConflictFromState(nextState);
        return nextState;
      });
    });

    socket.on('server:game:private_hand', (payload: {
      hand?: (number | Record<string, any>)[];
      board?: Record<string, any>;
      boardImageUrl?: string;
      board_url_image?: string;
    }) => {
      const boardImageUrl = payload.boardImageUrl ?? payload.board_url_image;
      const boardItems = [
        ...(payload.board ? [payload.board] : []),
        ...(boardImageUrl ? [{ type: 'board', url_image: boardImageUrl }] : []),
      ];

      setPrivateHand((previous) => {
        const previousBoardItems = previous.filter((item) => {
          if (typeof item === 'number') return false;

          const typeValue = String(item.type ?? item.kind ?? item.itemType ?? item.entityType ?? '').toLowerCase();
          const idValue = String(item.id ?? item.id_board ?? item.boardId ?? '').toLowerCase();
          const imageValue = String(
            item.url_image ?? item.imageUrl ?? item.image_url ?? item.url ?? item.board?.url_image ?? item.board?.imageUrl ?? ''
          ).toLowerCase();

          return Boolean(
            item.board ||
              item.id_board != null ||
              item.boardId != null ||
              typeValue.includes('board') ||
              typeValue.includes('tablero') ||
              idValue.startsWith('b_') ||
              idValue.includes('board') ||
              idValue.includes('tablero') ||
              imageValue.includes('/boards/') ||
              imageValue.includes('/tableros/') ||
              imageValue.includes('board') ||
              imageValue.includes('tablero')
          );
        });

        return [...(payload.hand ?? []), ...(boardItems.length > 0 ? boardItems : previousBoardItems)];
      });
    });

    socket.on('server:game:deck_reshuffled', () => {
      pushLobbyNotice('reshuffle', 'El mazo se ha barajado de nuevo con los descartes.');
    });

    socket.on('server:game:duel_available', (payload: { challengerId: string }) => {
      setDuelAvailableFor(payload.challengerId);
    });

    socket.on('server:game:special_event', (payload: GameSpecialEventPayload) => {
      setLatestSpecialEvent(payload);
      if (payload.effect === 'CONFLICT_RESOLVED' || payload.effect === 'CONFLICT_CANCELLED') {
        setActiveConflict(null);
        setDuelAvailableFor(null);
      }
      if (String(payload.effect ?? '').startsWith('MODE_CHANGED')) {
        setModeChangeOffer(null);
      }
    });

    socket.on('server:game:mode_change_offer', (payload: GameModeChangeOfferPayload) => {
      setModeChangeOffer(payload);
    });

    socket.on('server:game:star_spawned', (payload: GameStarPayload) => {
      setActiveStar(payload);
    });
    socket.on('star_spawned', (payload: GameStarPayload) => {
      setActiveStar(payload);
    });

    socket.on('server:game:star_claimed', (payload: GameStarClaimedPayload) => {
      setActiveStar(null);
      setGameState((prev) => {
        if (!prev || !payload.newScores) return prev;
        return { ...prev, scores: payload.newScores };
      });
    });
    socket.on('star_claimed', (payload: GameStarClaimedPayload) => {
      setActiveStar(null);
      setGameState((prev) => {
        if (!prev || !payload.newScores) return prev;
        return { ...prev, scores: payload.newScores };
      });
    });

    socket.on('server:game:minigame_start', (payload: GameConflictPayload) => {
      if (payload.isDuel) {
        setDuelAvailableFor(null);
      }
      setActiveConflict(payload);
    });

    socket.on('server:economy:wallet_updated', (payload: WalletUpdatedPayload) => {
      setWalletBalance(payload.balance);
    });

    socket.on('server:chat:message_received', (payload: { username?: string; text?: string; timestamp?: string }) => {
      const text = String(payload.text ?? '').trim();
      if (!text) return;

      setLobbyChatMessages((previous) => [
        ...previous.slice(-49),
        {
          id: `${payload.timestamp ?? Date.now()}-${previous.length}`,
          username: String(payload.username ?? 'Usuario'),
          text,
          timestamp: payload.timestamp ?? new Date().toISOString(),
        },
      ]);
    });

    socket.on('server:game:ended', (payload: GameEndedPayload) => {
      const finishedLobbyCode = currentLobbyCodeRef.current;
      if (finishedLobbyCode) {
        void AsyncStorage.setItem(
          DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
          finishedLobbyCode,
        );
      }
      setFinalRanking(Array.isArray(payload?.ranking) ? payload.ranking : []);
      setActiveConflict(null);
      setActiveStar(null);
      setActiveGameId(null);
    });

    socket.on('server:game:error', (payload: { message: string }) => {
      handleRealtimeGameError('Juego', payload.message);
    });

    socket.on('server:error', (payload: { message: string }) => {
      handleRealtimeGameError('Socket', payload.message);
    });

    socket.on('server:force_disconnect', (payload: { message: string }) => {
      Alert.alert('Sesion', payload.message);
      leaveLobbySession();
      router.replace('/menu');
    });

    socketRef.current = socket;
  };

  const connectToLobbySession = (
    wsToken: string,
    lobbyCode: string,
    options?: ConnectLobbyOptions
  ) => {
    void AsyncStorage.removeItem(DISMISSED_ACTIVE_LOBBY_STORAGE_KEY);
    socketDisabledRef.current = false;
    missingLobbyCleanupRef.current = null;
    updateCurrentLobbyCode(lobbyCode);
    pendingLobbyJoinRef.current = !!options?.emitJoin;
    setToken(wsToken);
  };

  // Nueva función para reconectar a una partida activa (cuando el usuario pulsa el banner)
  const reconnectToActiveGame = async () => {
    const storedToken = await AsyncStorage.getItem('userToken');
    if (!storedToken) {
      Alert.alert('Error', 'No hay sesión activa.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/refresh-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedToken}` },
      });

      if (!response.ok) {
        Alert.alert('Error', 'No se pudo recuperar la sesión de juego.');
        return;
      }

      const data = (await response.json()) as RefreshResponse;
      const dismissedLobbyCode = await AsyncStorage.getItem(
        DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
      );

      if (data.activeSession && data.wsToken && data.lobbyCode) {
        if (dismissedLobbyCode === data.lobbyCode) {
          setActiveGameId(null);
          setToken(null);
          clearRealtimeState();
          router.replace('/menu');
          return;
        }

        // Conectar el socket con el wsToken y navegar a la pantalla de juego
        socketDisabledRef.current = false;
        missingLobbyCleanupRef.current = null;
        setToken(data.wsToken);
        updateCurrentLobbyCode(data.lobbyCode);
        setActiveGameId(data.lobbyCode);
        // La conexión se activa mediante el useEffect que escucha cambios en 'token'
        router.replace({
          pathname: '/gameScreen',
          params: { lobbyCode: data.lobbyCode },
        });
      } else {
        Alert.alert('Aviso', 'No hay partida activa en este momento.');
        setActiveGameId(null);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    }
  };

  const refreshSession = async () => {
    const storedToken = await AsyncStorage.getItem('userToken');

    if (!storedToken) {
      setToken(null);
      clearRealtimeState();
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/refresh-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });

      if (!response.ok) {
        setToken(null);
        clearRealtimeState();
        return;
      }

      const data = (await response.json()) as RefreshResponse;
      const dismissedLobbyCode = await AsyncStorage.getItem(
        DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
      );

      if (data.activeSession && data.lobbyCode) {
        if (dismissedLobbyCode === data.lobbyCode) {
          setActiveGameId(null);
          setToken(null);
          clearRealtimeState();
          return;
        }
        // Solo guardamos el código de la partida activa para mostrar el banner,
        // NO establecemos el token ws ni conectamos el socket automáticamente.
        setActiveGameId(data.lobbyCode);
        // El token de autenticación normal sigue siendo válido, pero no iniciamos conexión realtime.
        // Dejamos token como null para no disparar la conexión del socket.
        setToken(null);
        // No establecemos currentLobbyCode ni llamamos a connectToLobbySession.
        return;
      }

      // Si no hay sesión activa, limpiamos cualquier rastro.
      setActiveGameId(null);
      setToken(null);
      clearRealtimeState();
    } catch {
      setToken(null);
      clearRealtimeState();
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    connectSocket(token);

    return () => {
      disconnectSocket();
    };
  }, [token]);

  const value: GameSessionContextValue = {
    token,
    activeGameId,
    currentLobbyCode,
    lobbyState,
    gameState,
    privateHand,
    duelAvailableFor,
    activeConflict,
    latestSpecialEvent,
    modeChangeOffer,
    activeStar,
    lastGameError,
    latestLobbyNotice,
    lobbyChatMessages,
    walletBalance,
    finalRanking,
    isSocketConnected,
    emitGameAction,
    claimStar,
    submitMinigameScore,
    submitConflictResult,
    clearConflict,
    clearModeChangeOffer,
    refreshSession,
    reconnectToActiveGame,
    connectToLobbySession,
    leaveLobbySession,
    sendLobbyChatMessage,
    dismissActiveGame,
    closeActiveGame,
    startLobbyGame,
    setActiveGameId,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession() {
  const context = useContext(GameSessionContext);

  if (!context) {
    throw new Error('useGameSession debe usarse dentro de GameSessionProvider');
  }

  return context;
}
