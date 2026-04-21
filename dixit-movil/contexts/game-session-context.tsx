import { API_URL, SOCKET_URL } from '@/constants/api';
import {
  GameConflictPayload,
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

type WalletUpdatedPayload = {
  balance: number;
};

type GameSessionError = {
  message: string;
  at: number;
};

type ConnectLobbyOptions = {
  emitJoin?: boolean;
};

const DISMISSED_ACTIVE_LOBBY_STORAGE_KEY = 'dismissedActiveLobbyCode';

type GameSessionContextValue = {
  token: string | null;
  activeGameId: string | null;
  currentLobbyCode: string | null;
  lobbyState: LobbyState | null;
  gameState: GenericGameState | null;
  privateHand: Array<number | { id: string; url_image: string }>;
  duelAvailableFor: string | null;
  activeConflict: GameConflictPayload | null;
  latestSpecialEvent: GameSpecialEventPayload | null;
  activeStar: GameStarPayload | null;
  lastGameError: GameSessionError | null;
  walletBalance: number | null;
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
  refreshSession: () => Promise<void>;
  reconnectToActiveGame: () => Promise<void>;
  connectToLobbySession: (wsToken: string, lobbyCode: string, options?: ConnectLobbyOptions) => void;
  leaveLobbySession: () => void;
  dismissActiveGame: (lobbyCode?: string | null) => Promise<void>;
  startLobbyGame: () => void;
  setActiveGameId: (value: string | null) => void;
};

const GameSessionContext = createContext<GameSessionContextValue | null>(null);

export function GameSessionProvider({ children }: PropsWithChildren) {
  const socketRef = useRef<Socket | null>(null);
  const socketDisabledRef = useRef(false);
  const pendingLobbyJoinRef = useRef(false);
  const currentLobbyCodeRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [currentLobbyCode, setCurrentLobbyCode] = useState<string | null>(null);
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GenericGameState | null>(null);
  const [privateHand, setPrivateHand] = useState<Array<number | { id: string; url_image: string }>>([]);
  const [duelAvailableFor, setDuelAvailableFor] = useState<string | null>(null);
  const [activeConflict, setActiveConflict] = useState<GameConflictPayload | null>(null);
  const [latestSpecialEvent, setLatestSpecialEvent] = useState<GameSpecialEventPayload | null>(null);
  const [activeStar, setActiveStar] = useState<GameStarPayload | null>(null);
  const [lastGameError, setLastGameError] = useState<GameSessionError | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const updateCurrentLobbyCode = (value: string | null) => {
    currentLobbyCodeRef.current = value;
    setCurrentLobbyCode(value);
  };

  const clearConflict = () => {
    setActiveConflict(null);
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
    setActiveStar(null);
    setLastGameError(null);
    setActiveGameId(null);
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

    socketRef.current.emit('client:game:submit_minigame_score', {
      lobbyCode: resolvedLobbyCode,
      score,
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

  const startLobbyGame = () => {
    if (!socketRef.current || !socketRef.current.connected) return;
    socketRef.current.emit('client:lobby:start');
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

  const handleRealtimeGameError = (title: string, message: string) => {
    setLastGameError({
      message,
      at: Date.now(),
    });
    Alert.alert(title, message);

    if (currentLobbyCodeRef.current) {
      requestRealtimeResync(currentLobbyCodeRef.current);
    }
    void resyncActiveRealtimeSession();
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

    socket.on('server:session:recovered', (payload: GameSessionRecoveredPayload) => {
      updateCurrentLobbyCode(payload.lobbyCode);
      setActiveGameId(payload.lobbyCode);
      setGameState(payload.state);
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
      const nextState = {
        ...payload.state,
        board: payload.board ?? payload.state.board,
      };
      setGameState(nextState);
      syncConflictFromState(nextState);
    });

    socket.on('server:game:state_updated', (payload: GameStateUpdatedPayload) => {
      setGameState((prev) => {
        const nextState = {
          ...payload.state,
          board: payload.state.board ?? prev?.board,
        };
        syncConflictFromState(nextState);
        return nextState;
      });
    });

    socket.on('server:game:private_hand', (payload: { hand: Array<number | { id: string; url_image: string }> }) => {
      setPrivateHand(payload.hand ?? []);
    });

    socket.on('server:game:duel_available', (payload: { challengerId: string }) => {
      setDuelAvailableFor(payload.challengerId);
    });

    socket.on('server:game:special_event', (payload: GameSpecialEventPayload) => {
      setLatestSpecialEvent(payload);
      if (payload.effect === 'CONFLICT_RESOLVED' || payload.effect === 'CONFLICT_CANCELLED') {
        setActiveConflict(null);
      }
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
      setActiveConflict(payload);
    });

    socket.on('server:economy:wallet_updated', (payload: WalletUpdatedPayload) => {
      setWalletBalance(payload.balance);
    });

    socket.on('server:game:ended', () => {
      setActiveConflict(null);
      setActiveStar(null);
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
    activeStar,
    lastGameError,
    walletBalance,
    isSocketConnected,
    emitGameAction,
    claimStar,
    submitMinigameScore,
    submitConflictResult,
    clearConflict,
    refreshSession,
    reconnectToActiveGame,
    connectToLobbySession,
    leaveLobbySession,
    dismissActiveGame,
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
