import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { DuelMinigameModal } from '@/components/minigames/duel-minigame-modal';
import { API_URL } from '@/constants/api';
import { useGameSession } from '@/contexts/game-session-context';

SplashScreen.preventAutoHideAsync();

type HandCard = {
  id: number;
  rawId: string;
  url_image: string | null;
};

type BoardCard = {
  id: number;
  url_image: string | null;
};

type StellaMarks = Record<string, number[]>;
type StellaRoundScores = Record<string, number>;

const COMPLETED_CONFLICT_STORAGE_KEY = 'completedConflictKey';
const COMPLETED_CONFLICT_RESULT_STORAGE_KEY = 'completedConflictResult';

const FALLBACK_BOARD = Array.from({ length: 42 }, (_, index) => ({
  index: index + 1,
  type: [5, 7, 9, 10, 11, 18, 21, 25, 27, 31, 34, 37, 40].includes(index + 1) ? 'special' : 'normal',
}));

const normalizeCardId = (value: string | number) => Number(String(value).replace(/\D/g, ''));

const normalizeNumberList = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];

const extractCollections = (payload: any) => {
  if (Array.isArray(payload?.collections?.collections)) return payload.collections.collections;
  if (Array.isArray(payload?.collections)) return payload.collections;
  if (Array.isArray(payload)) return payload;
  return [];
};

const flattenCollectionCards = (items: any[]) =>
  items.flatMap((item) => (Array.isArray(item?.cards) ? item.cards : item));

const extractCollectionCards = (payload: any) => {
  if (Array.isArray(payload?.cards?.cards)) return payload.cards.cards;
  if (Array.isArray(payload?.cards?.collections)) {
    return flattenCollectionCards(payload.cards.collections);
  }
  if (Array.isArray(payload?.cards)) return flattenCollectionCards(payload.cards);
  if (Array.isArray(payload?.cards?.collections?.[0]?.cards)) return payload.cards.collections[0].cards;
  if (Array.isArray(payload?.collection?.cards)) return payload.collection.cards;
  if (Array.isArray(payload)) return flattenCollectionCards(payload);
  return [];
};

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lobbyCode?: string; gameId?: string }>();
  const {
    activeConflict,
    activeGameId,
    activeStar,
    claimStar,
    clearModeChangeOffer,
    currentLobbyCode,
    dismissActiveGame,
    duelAvailableFor,
    emitGameAction,
    finalRanking,
    gameState,
    isSocketConnected,
    lastGameError,
    latestSpecialEvent,
    lobbyChatMessages,
    lobbyState,
    modeChangeOffer,
    privateHand,
    sendLobbyChatMessage,
    setActiveGameId,
    submitMinigameScore,
  } = useGameSession();

  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedHandCardId, setSelectedHandCardId] = useState<number | null>(null);
  const [selectedVoteCardId, setSelectedVoteCardId] = useState<number | null>(null);
  const [selectedStellaCardIds, setSelectedStellaCardIds] = useState<number[]>([]);
  const [storyClue, setStoryClue] = useState('');
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(true);
  const [completedConflictKey, setCompletedConflictKey] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<string | null>(null);
  const [catalogCardUrls, setCatalogCardUrls] = useState<Record<string, string>>({});
  const [knownCardUrls, setKnownCardUrls] = useState<Record<string, string>>({});
  const [boardImageFailed, setBoardImageFailed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const emitGameActionRef = useRef(emitGameAction);
  const starProgress = useRef(new Animated.Value(0)).current;
  const chatPanelProgress = useRef(new Animated.Value(0)).current;
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    emitGameActionRef.current = emitGameAction;
  }, [emitGameAction]);

  useEffect(() => {
    Animated.timing(chatPanelProgress, {
      toValue: chatOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chatOpen, chatPanelProgress]);

  useEffect(() => {
    const bootstrapUser = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const response = await fetch(`${API_URL}/users/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (response.ok && data.profile?.id) {
          setCurrentUserId(String(data.profile.id));
        }
      } catch {}
    };

    bootstrapUser();
  }, []);

  useEffect(() => {
    const hydrateCardCatalog = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const collectionsResponse = await fetch(`${API_URL}/collections`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const collectionsData = await collectionsResponse.json();
        if (!collectionsResponse.ok) return;

        const collections = extractCollections(collectionsData);

        const collectionEntries = await Promise.all(
          collections.map(async (collection: any) => {
            const collectionId = collection.id ?? collection.id_collection;
            if (!collectionId) return [];

            try {
              const cardsResponse = await fetch(`${API_URL}/collections/${collectionId}/cards`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const cardsData = await cardsResponse.json();
              if (!cardsResponse.ok) return [];

              const cards = extractCollectionCards(cardsData);

              return cards
                .map((card: any) => {
                  const id = normalizeCardId(card.id ?? card.cardId ?? card.id_card);
                  const url = card.url_image;
                  if (!id || typeof url !== 'string' || !url.trim()) return null;
                  return [String(id), url] as const;
                })
                .filter(Boolean);
            } catch {
              return [];
            }
          })
        );

        let ownedCardEntries: Array<readonly [string, string]> = [];
        try {
          const ownedCardsResponse = await fetch(`${API_URL}/users/cards`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const ownedCardsData = await ownedCardsResponse.json();
          if (ownedCardsResponse.ok) {
            const ownedCards = extractCollectionCards(ownedCardsData);
            ownedCardEntries = ownedCards
              .map((card: any) => {
                const id = normalizeCardId(card.id ?? card.cardId ?? card.id_card);
                const url = card.url_image;
                if (!id || typeof url !== 'string' || !url.trim()) return null;
                return [String(id), url] as const;
              })
              .filter(Boolean) as Array<readonly [string, string]>;
          }
        } catch {}

        setCatalogCardUrls(Object.fromEntries([...collectionEntries.flat(), ...ownedCardEntries]));
      } catch {}
    };

    void hydrateCardCatalog();
  }, []);

  useEffect(() => {
    const routeLobbyCode = params.lobbyCode ?? params.gameId;
    if (routeLobbyCode && !activeGameId) {
      setActiveGameId(String(routeLobbyCode));
    }
  }, [activeGameId, params.gameId, params.lobbyCode, setActiveGameId]);

  useEffect(() => {
    setSelectedHandCardId(null);
    setSelectedVoteCardId(null);
    setShowConflictModal(true);
    setPendingActionType(null);
    if (gameState?.currentRound?.clue) {
      setStoryClue(gameState.currentRound.clue);
    } else {
      setStoryClue('');
    }
  }, [activeConflict, gameState?.currentRound?.clue, gameState?.phase]);

  useEffect(() => {
    if (!pendingActionType) return;

    const timeout = setTimeout(() => {
      setPendingActionType(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [pendingActionType]);

  useEffect(() => {
    if (!lastGameError) return;
    setPendingActionType(null);
  }, [lastGameError]);

  useEffect(() => {
    if (!isSocketConnected) {
      setPendingActionType(null);
    }
  }, [isSocketConnected]);

  const resolvedLobbyCode = String(currentLobbyCode ?? activeGameId ?? params.lobbyCode ?? params.gameId ?? '');
  const currentPhase = String(gameState?.phase ?? 'WAITING');
  const currentRound = gameState?.currentRound;
  const visibleRoundPrompt = String(currentRound?.clue ?? currentRound?.word ?? '').trim();
  const storytellerId = String(currentRound?.storytellerId ?? '');
  const isStoryteller = storytellerId === currentUserId;
  const playedCards = currentRound?.playedCards ?? {};
  const votes = currentRound?.votes ?? [];
  const storytellerAlreadyPlayed =
    currentRound?.storytellerCardId != null || playedCards[storytellerId] != null;
  const playerAlreadySubmitted = playedCards[currentUserId] != null;
  const recoveredSelectedVoteCardId = normalizeCardId(currentRound?.selectedVoteCardId ?? '');
  const hasRecoveredSelectedVote =
    currentRound?.selectedVoteCardId != null && Number.isFinite(recoveredSelectedVoteCardId);
  const playerAlreadyVoted =
    votes.some((vote) => vote.voterId === currentUserId) || hasRecoveredSelectedVote;
  const scores = gameState?.scores ?? {};
  const players = (gameState?.players ?? []).map((playerId) => ({
    id: String(playerId),
    score: scores[String(playerId)] ?? 0,
    connected: !(gameState?.disconnectedPlayers ?? []).includes(String(playerId)),
  }));

  useEffect(() => {
    if (currentPhase !== 'VOTING' || !hasRecoveredSelectedVote) return;
    setSelectedVoteCardId(recoveredSelectedVoteCardId);
  }, [currentPhase, hasRecoveredSelectedVote, recoveredSelectedVoteCardId]);

  const handCards = useMemo<HandCard[]>(
    () => {
      const uniqueCards = new Map<number, HandCard>();

      privateHand
        .map((card, index) => {
          if (typeof card === 'number') {
            return {
              id: card,
              rawId: String(card),
              url_image: null,
            };
          }

          const numericId = normalizeCardId(card.id);
          return {
            id: numericId || index + 1,
            rawId: String(card.id),
            url_image: typeof card.url_image === 'string' && card.url_image.trim().length > 0 ? card.url_image : null,
          };
        })
        .filter((card) => Number.isFinite(card.id))
        .forEach((card) => {
          const previousCard = uniqueCards.get(card.id);
          if (!previousCard || (!previousCard.url_image && card.url_image)) {
            uniqueCards.set(card.id, card);
          }
        });

      return Array.from(uniqueCards.values());
    },
    [privateHand]
  );

  const boardCardsDetailed = currentRound?.boardCardsDetailed;
  const boardCards = useMemo<BoardCard[]>(
    () => {
      if (Array.isArray(boardCardsDetailed) && boardCardsDetailed.length > 0) {
        return boardCardsDetailed
          .map((card) => {
            const id = normalizeCardId(card.id ?? card.cardId ?? card.id_card ?? '');
            const url = typeof card.url_image === 'string' && card.url_image.trim().length > 0
              ? card.url_image
              : null;

            return Number.isFinite(id) && id > 0 ? { id, url_image: url } : null;
          })
          .filter((card): card is BoardCard => Boolean(card));
      }

      return (currentRound?.boardCards ?? [])
        .map((cardId) => Number(cardId))
        .filter((cardId) => Number.isFinite(cardId))
        .map((cardId) => ({
          id: cardId,
          url_image: null,
        }));
    },
    [boardCardsDetailed, currentRound?.boardCards]
  );

  const isStellaMode = String(gameState?.mode ?? lobbyState?.engine ?? '').toUpperCase() === 'STELLA';
  const privateHandUrlMap = useMemo(
    () =>
      Object.fromEntries(
        handCards
          .filter((card) => typeof card.url_image === 'string' && card.url_image.trim().length > 0)
          .map((card) => [String(card.id), card.url_image as string])
      ),
    [handCards]
  );
  const boardCardUrlMap = useMemo(
    () =>
      Object.fromEntries(
        boardCards
          .filter((card) => typeof card.url_image === 'string' && card.url_image.trim().length > 0)
          .map((card) => [String(card.id), card.url_image as string])
      ),
    [boardCards]
  );

  useEffect(() => {
    const mergedUrls = {
      ...privateHandUrlMap,
      ...boardCardUrlMap,
    };

    if (Object.keys(mergedUrls).length === 0) return;

    setKnownCardUrls((previous) => ({
      ...previous,
      ...mergedUrls,
    }));
  }, [boardCardUrlMap, privateHandUrlMap]);

  const cardUrlMap = useMemo(
    () => ({
      ...(gameState?.cardUrls && typeof gameState.cardUrls === 'object'
        ? (gameState.cardUrls as Record<string, string>)
        : {}),
      ...catalogCardUrls,
      ...knownCardUrls,
    }),
    [catalogCardUrls, gameState?.cardUrls, knownCardUrls]
  );
  const stellaWord = typeof currentRound?.word === 'string' ? currentRound.word : '';
  const stellaPlayerMarks =
    currentRound?.playerMarks && typeof currentRound.playerMarks === 'object'
      ? (currentRound.playerMarks as StellaMarks)
      : {};
  const stellaRevealedCards = normalizeNumberList(currentRound?.revealedCards);
  const stellaFallenPlayers = Array.isArray(currentRound?.fallenPlayers)
    ? currentRound.fallenPlayers.map(String)
    : [];
  const stellaCurrentScoutId =
    typeof currentRound?.currentScoutId === 'string' ? currentRound.currentScoutId : '';
  const stellaInTheDarkPlayerId =
    typeof currentRound?.inTheDarkPlayerId === 'string' ? currentRound.inTheDarkPlayerId : '';
  const stellaRoundScores =
    currentRound?.roundScores && typeof currentRound.roundScores === 'object'
      ? (currentRound.roundScores as StellaRoundScores)
      : {};
  const stellaSuccessfulMarks =
    currentRound?.successfulMarks && typeof currentRound.successfulMarks === 'object'
      ? (currentRound.successfulMarks as StellaRoundScores)
      : {};
  const stellaBoardCardIds = boardCards.map((card) => card.id).filter((cardId) => Number.isFinite(cardId));
  const stellaBoardKey = stellaBoardCardIds.join(':');
  const myStellaMarks = normalizeNumberList(stellaPlayerMarks[currentUserId]);
  const hasSubmittedStellaMarks = myStellaMarks.length > 0;
  const isCurrentStellaScout = stellaCurrentScoutId === currentUserId;
  const hasCurrentUserFallen = stellaFallenPlayers.includes(currentUserId);

  const normalizedPlayedCards = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(playedCards)
          .map(([playerId, cardId]) => [String(playerId), Number(cardId)] as const)
          .filter(([, cardId]) => Number.isFinite(cardId))
      ),
    [playedCards]
  );
  const playedBoardCards = useMemo<BoardCard[]>(() => {
    if (boardCards.length > 0) return boardCards;

    return Object.values(normalizedPlayedCards).map((cardId) => ({
      id: cardId,
      url_image: null,
    }));
  }, [boardCards, normalizedPlayedCards]);
  const ownPlayedCardId = normalizedPlayedCards[currentUserId];
  const voteableBoardCards = playedBoardCards.filter((card) => card.id !== ownPlayedCardId);
  const storytellerBoardCards = playedBoardCards.filter((card) => card.id !== ownPlayedCardId);
  const boardTiles = Array.isArray(gameState?.board?.tiles) && gameState.board.tiles.length > 0 ? gameState.board.tiles : FALLBACK_BOARD;
  const boardImageUrl =
    typeof gameState?.board?.url_image === 'string' && gameState.board.url_image.trim().length > 0
      ? gameState.board.url_image
      : null;
  const boardHasOverlay = Boolean(boardImageUrl && !boardImageFailed);
  const activeConflictData = gameState?.activeConflict ?? activeConflict ?? null;
  const activeConflictKey = activeConflictData
    ? `${activeConflictData.player1}:${activeConflictData.player2}:${activeConflictData.isDuel ? 'duel' : 'tie'}`
    : null;
  const activeConflictDuration = activeConflictData?.duration;
  const isParticipant =
    activeConflictData?.player1 === currentUserId || activeConflictData?.player2 === currentUserId;
  const fallbackWinnerId = gameState?.winners?.[0] ?? players.slice().sort((a, b) => b.score - a.score)[0]?.id;
  const finalWinnerId = finalRanking[0]?.playerId ?? fallbackWinnerId ?? '';
  const didCurrentUserWin = Boolean(currentUserId && finalWinnerId === currentUserId);
  const availableDuelTargets = players.filter((player) => player.id !== currentUserId);
  const canResolveDuel = Boolean(duelAvailableFor && duelAvailableFor === currentUserId && currentPhase === 'SCORING' && !gameState?.isMinigameActive);

  const formatSpecialEvent = () => {
    if (!latestSpecialEvent) return '';

    const playerLabel = latestSpecialEvent.pId ?? 'Un jugador';
    const targetLabel = typeof latestSpecialEvent.targetId === 'string' ? latestSpecialEvent.targetId : 'otro jugador';
    const points = Number(latestSpecialEvent.points ?? 0);
    const signedPoints = points > 0 ? `+${points}` : String(points);

    switch (latestSpecialEvent.effect) {
      case 'ODD':
        return `${playerLabel} activa casilla impar ${latestSpecialEvent.squareId ?? ''}: ${signedPoints} punto${Math.abs(points) === 1 ? '' : 's'}.`;
      case 'EVEN':
        return `${playerLabel} activa casilla par ${latestSpecialEvent.squareId ?? ''}: ${signedPoints} punto${Math.abs(points) === 1 ? '' : 's'}.`;
      case 'EQUILIBRIUM':
        return 'Casilla de equilibrio: cada jugador avanza segun su posicion en el ranking.';
      case 'SHUFFLE':
        return `${playerLabel} ha cambiado toda su mano.`;
      case 'STELLA_SCORE_SWAP':
        return `${playerLabel} intercambia puntuacion con ${targetLabel}.`;
      case 'NOTHING_HAPPENED':
        return typeof latestSpecialEvent.message === 'string' ? latestSpecialEvent.message : 'La casilla bonus no tuvo efecto.';
      case 'MODE_CHANGED_TO_STELLA':
      case 'MODE_CHANGED_TO_STANDARD':
        return typeof latestSpecialEvent.message === 'string' ? latestSpecialEvent.message : 'La partida ha cambiado de modo.';
      case 'CONFLICT_RESOLVED':
        return 'Minijuego resuelto. La partida continua.';
      case 'CONFLICT_CANCELLED':
        return 'El minijuego se ha cancelado y la partida continua.';
      default:
        return typeof latestSpecialEvent.message === 'string'
          ? latestSpecialEvent.message
          : `${latestSpecialEvent.effect ?? 'Evento especial'}${latestSpecialEvent.pId ? ` para ${latestSpecialEvent.pId}` : ''}.`;
    }
  };

  useEffect(() => {
    setSelectedStellaCardIds([]);
  }, [stellaBoardKey]);

  useEffect(() => {
    setBoardImageFailed(false);
  }, [boardImageUrl]);

  useEffect(() => {
    if (!activeStar) {
      starProgress.stopAnimation();
      starProgress.setValue(0);
      return;
    }

    starProgress.setValue(0);
    Animated.timing(starProgress, {
      toValue: 1,
      duration: typeof activeStar.duration === 'number' ? activeStar.duration : 2500,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [activeStar, starProgress]);

  useEffect(() => {
    if (currentPhase !== 'STELLA_MARKING') {
      setSelectedStellaCardIds([]);
    }
  }, [currentPhase]);

  useEffect(() => {
    if (!pendingActionType) return;

    if (gameState?.isMinigameActive) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'SEND_STORY' && (currentRound?.storytellerCardId != null || currentRound?.playedCards?.[storytellerId] != null)) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'SUBMIT_CARD' && currentRound?.playedCards?.[currentUserId] != null) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'CAST_VOTE' && (currentRound?.votes ?? []).some((vote) => vote.voterId === currentUserId)) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'STELLA_SUBMIT_MARKS' && hasSubmittedStellaMarks) {
      setPendingActionType(null);
      return;
    }

    if (
      pendingActionType === 'STELLA_REVEAL_MARK' &&
      (!isCurrentStellaScout || hasCurrentUserFallen)
    ) {
      setPendingActionType(null);
    }
  }, [
    currentRound?.playedCards,
    currentRound?.storytellerCardId,
    currentRound?.votes,
    currentUserId,
    gameState?.isMinigameActive,
    hasCurrentUserFallen,
    hasSubmittedStellaMarks,
    isCurrentStellaScout,
    pendingActionType,
    storytellerId,
  ]);

  useEffect(() => {
    if (!activeConflictData) {
      setShowConflictModal(false);
      setPendingScore(null);
      setCompletedConflictKey(null);
      void AsyncStorage.removeItem(COMPLETED_CONFLICT_STORAGE_KEY);
      void AsyncStorage.removeItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);
      return;
    }

    if (isParticipant && completedConflictKey !== activeConflictKey) {
      setShowConflictModal(true);
    }
  }, [activeConflictData, activeConflictKey, completedConflictKey, isParticipant]);

  useEffect(() => {
    const hydrateCompletedConflict = async () => {
      if (!activeConflictKey) return;

      const storedConflictKey = await AsyncStorage.getItem(COMPLETED_CONFLICT_STORAGE_KEY);
      const storedConflictResult = await AsyncStorage.getItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);

      if (storedConflictKey === activeConflictKey) {
        setCompletedConflictKey(activeConflictKey);
        if (storedConflictResult) {
          const parsed = Number(storedConflictResult);
          if (Number.isFinite(parsed)) {
            setPendingScore(parsed);
          }
        }
        setShowConflictModal(false);
      }
    };

    void hydrateCompletedConflict();
  }, [activeConflictKey]);

  useEffect(() => {
    if (!activeConflictKey || !gameState?.isMinigameActive || !resolvedLobbyCode) return;

    const rawDuration = Number(activeConflictDuration ?? 0);
    const durationMs = rawDuration > 1000 ? rawDuration : rawDuration * 1000;
    const timeout = setTimeout(() => {
      setShowConflictModal(false);
      emitGameActionRef.current({
        actionType: 'RECONNECT_PLAYER',
        payload: {},
      }, resolvedLobbyCode);
    }, Math.max(25000, durationMs + 23000));

    return () => clearTimeout(timeout);
  }, [
    activeConflictDuration,
    activeConflictKey,
    gameState?.isMinigameActive,
    resolvedLobbyCode,
  ]);

  const sendStory = () => {
    if (currentPhase !== 'STORYTELLING' || gameState?.isMinigameActive) return;
    if (!selectedHandCardId || !storyClue.trim() || storytellerAlreadyPlayed || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'SEND_STORY',
      payload: {
        cardId: selectedHandCardId,
        clue: storyClue.trim(),
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo enviar la historia porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('SEND_STORY');
  };

  const submitCard = () => {
    if (currentPhase !== 'SUBMISSION' || gameState?.isMinigameActive) return;
    if (!selectedHandCardId || playerAlreadySubmitted || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'SUBMIT_CARD',
      payload: {
        cardId: selectedHandCardId,
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo enviar la carta porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('SUBMIT_CARD');
  };

  const castVote = () => {
    if (currentPhase !== 'VOTING' || gameState?.isMinigameActive) return;
    if (!selectedVoteCardId || playerAlreadyVoted || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'CAST_VOTE',
      payload: {
        cardId: selectedVoteCardId,
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo enviar el voto porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('CAST_VOTE');
  };

  const sendChatMessage = () => {
    if (!chatText.trim()) return;

    const emitted = sendLobbyChatMessage(chatText, resolvedLobbyCode);
    if (!emitted) {
      Alert.alert('Chat', 'No se pudo enviar el mensaje porque el socket no esta conectado.');
      return;
    }

    setChatText('');
  };

  const getCardImageUrl = (cardId: number) => {
    const url = cardUrlMap[String(cardId)] ?? cardUrlMap[cardId];
    return typeof url === 'string' && url.trim().length > 0 ? url : null;
  };

  const starStartX = activeStar?.path?.start?.x ?? 12;
  const starStartY = activeStar?.path?.start?.y ?? 18;
  const starEndX = activeStar?.path?.end?.x ?? 86;
  const starEndY = activeStar?.path?.end?.y ?? 36;
  const starTranslateX = starProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ((starEndX - starStartX) / 100) * viewportWidth],
  });
  const starTranslateY = starProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ((starEndY - starStartY) / 100) * viewportHeight],
  });
  const starScale = starProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.88, 1.08, 0.96],
  });
  const starOpacity = starProgress.interpolate({
    inputRange: [0, 0.08, 0.92, 1],
    outputRange: [0, 1, 1, 0.2],
  });

  const toggleStellaMark = (cardId: number) => {
    if (currentPhase !== 'STELLA_MARKING' || hasSubmittedStellaMarks || pendingActionType) return;

    setSelectedStellaCardIds((previous) => {
      if (previous.includes(cardId)) {
        return previous.filter((selectedCardId) => selectedCardId !== cardId);
      }

      if (previous.length >= 10) {
        return previous;
      }

      return [...previous, cardId];
    });
  };

  const submitStellaMarks = () => {
    if (currentPhase !== 'STELLA_MARKING' || gameState?.isMinigameActive) return;
    if (selectedStellaCardIds.length < 1 || selectedStellaCardIds.length > 10 || hasSubmittedStellaMarks || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'STELLA_SUBMIT_MARKS',
      payload: {
        cardIds: selectedStellaCardIds,
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudieron enviar las marcas porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('STELLA_SUBMIT_MARKS');
  };

  const revealStellaMark = (cardId: number) => {
    if (currentPhase !== 'STELLA_REVEAL' || gameState?.isMinigameActive) return;
    if (!isCurrentStellaScout || hasCurrentUserFallen || !myStellaMarks.includes(cardId) || stellaRevealedCards.includes(cardId) || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'STELLA_REVEAL_MARK',
      payload: {
        cardId,
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo revelar la carta porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('STELLA_REVEAL_MARK');
  };

  const startStellaRound = () => {
    if (currentPhase !== 'STELLA_WORD_REVEAL' || gameState?.isMinigameActive || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'NEXT_ROUND',
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo empezar la ronda porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('NEXT_ROUND');
  };

  const goNextRound = () => {
    if (currentPhase !== 'SCORING' || gameState?.isMinigameActive) return;
    if (pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'NEXT_ROUND',
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo avanzar la ronda porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('NEXT_ROUND');
  };

  const acceptModeChangeOffer = () => {
    if (!modeChangeOffer || pendingActionType || currentPhase !== 'SCORING') return;

    const emitted = emitGameAction({
      actionType: 'ACCEPT_MODE_CHANGE',
      payload: {},
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo aceptar el cambio de modo porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('ACCEPT_MODE_CHANGE');
    clearModeChangeOffer();
  };

  const startDuelAgainst = (targetId: string) => {
    if (!canResolveDuel || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'RESOLVE_DUEL',
      payload: { targetId },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo iniciar el duelo porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('RESOLVE_DUEL');
  };

  useEffect(() => {
    if (modeChangeOffer && currentPhase !== 'SCORING') {
      clearModeChangeOffer();
    }
  }, [clearModeChangeOffer, currentPhase, modeChangeOffer]);

  useEffect(() => {
    if (
      currentPhase !== 'SCORING' ||
      gameState?.isMinigameActive ||
      pendingActionType ||
      modeChangeOffer ||
      !resolvedLobbyCode
    ) return;

    const timeout = setTimeout(() => {
      emitGameActionRef.current({
        actionType: 'NEXT_ROUND',
      }, resolvedLobbyCode);
    }, 12000);

    return () => clearTimeout(timeout);
  }, [
    currentPhase,
    gameState?.isMinigameActive,
    modeChangeOffer,
    pendingActionType,
    resolvedLobbyCode,
  ]);

  const leaveFinishedGame = async () => {
    await AsyncStorage.removeItem(COMPLETED_CONFLICT_STORAGE_KEY);
    await AsyncStorage.removeItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);
    await dismissActiveGame(resolvedLobbyCode);
    router.replace('/menu');
  };

  const resolveConflictWinner = (_winnerId: string) => {};

  const renderStellaCard = (
    cardId: number,
    options?: {
      selected?: boolean;
      revealed?: boolean;
      disabled?: boolean;
      label?: string;
      keySuffix?: string | number;
      onPress?: () => void;
    }
  ) => {
    const imageUrl = getCardImageUrl(cardId);

    return (
      <TouchableOpacity
        key={`stella-${cardId}-${options?.keySuffix ?? 'card'}`}
        style={[
          styles.stellaCard,
          options?.selected && styles.stellaCardSelected,
          options?.revealed && styles.stellaCardRevealed,
          options?.disabled && styles.stellaCardDisabled,
        ]}
        disabled={options?.disabled || !options?.onPress}
        onPress={options?.onPress}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.stellaCardImage} />
        ) : (
          <View style={styles.placeholderCardFace}>
            <Text style={styles.placeholderCardId}>Carta {cardId}</Text>
          </View>
        )}
        {options?.label ? (
          <View style={styles.stellaCardBadge}>
            <Text style={styles.stellaCardBadgeText}>{options.label}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderStellaScoreRows = () => (
    <View style={styles.scoreList}>
      {players.map((player) => (
        <View key={`stella-score-${player.id}`} style={[styles.resultRow, player.id === currentUserId && styles.resultRowSelf]}>
          <View>
            <Text style={styles.resultName}>
              {player.id}
              {player.id === currentUserId ? ' (tu)' : ''}
            </Text>
            <Text style={styles.resultMeta}>
              Ronda: {stellaRoundScores[player.id] ?? 0} · Aciertos: {stellaSuccessfulMarks[player.id] ?? 0}
            </Text>
          </View>
          <Text style={styles.resultCoins}>{player.score}</Text>
        </View>
      ))}
    </View>
  );

  const renderStellaPhasePanel = () => {
    const submittedPlayersCount = Object.keys(stellaPlayerMarks).length;
    const revealableMarks = myStellaMarks.filter((cardId) => !stellaRevealedCards.includes(cardId));

    if (currentPhase === 'STELLA_WORD_REVEAL') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Stella: palabra de la ronda</Text>
          <Text style={styles.stellaWord}>{stellaWord || 'Esperando palabra...'}</Text>
          <Text style={styles.noticeText}>Cuando el backend abra la ronda podras marcar entre 1 y 10 cartas.</Text>
          <TouchableOpacity
            style={[styles.actionButton, (!isSocketConnected || !!pendingActionType) && styles.actionButtonDisabled]}
            disabled={!isSocketConnected || !!pendingActionType}
            onPress={startStellaRound}
          >
            <Text style={styles.actionButtonText}>
              {pendingActionType === 'NEXT_ROUND' ? 'Empezando...' : 'Empezar marcaje'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentPhase === 'STELLA_MARKING') {
      return (
        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>Stella: marca cartas</Text>
            <Text style={styles.mutedText}>{hasSubmittedStellaMarks ? 'Enviado' : `${selectedStellaCardIds.length}/10`}</Text>
          </View>
          <Text style={styles.stellaWord}>{stellaWord || 'Sin palabra'}</Text>
          <Text style={styles.noticeText}>
            {hasSubmittedStellaMarks
              ? `Tus marcas estan enviadas. Esperando jugadores: ${submittedPlayersCount}/${players.length}.`
              : 'Selecciona en secreto las cartas que relacionas con la palabra.'}
          </Text>
          <View style={styles.stellaCardGrid}>
            {stellaBoardCardIds.map((cardId, index) =>
              renderStellaCard(cardId, {
                selected: selectedStellaCardIds.includes(cardId) || myStellaMarks.includes(cardId),
                disabled: hasSubmittedStellaMarks || !!pendingActionType,
                label: selectedStellaCardIds.includes(cardId) || myStellaMarks.includes(cardId) ? 'Marcada' : undefined,
                keySuffix: index,
                onPress: () => toggleStellaMark(cardId),
              })
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.actionButton,
              (!isSocketConnected || !!pendingActionType || hasSubmittedStellaMarks || selectedStellaCardIds.length < 1 || selectedStellaCardIds.length > 10) && styles.actionButtonDisabled,
            ]}
            disabled={!isSocketConnected || !!pendingActionType || hasSubmittedStellaMarks || selectedStellaCardIds.length < 1 || selectedStellaCardIds.length > 10}
            onPress={submitStellaMarks}
          >
            <Text style={styles.actionButtonText}>
              {hasSubmittedStellaMarks
                ? 'Marcas enviadas'
                : pendingActionType === 'STELLA_SUBMIT_MARKS'
                  ? 'Enviando...'
                  : 'Enviar marcas'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentPhase === 'STELLA_REVEAL') {
      return (
        <View style={styles.panel}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>Stella: revelar marcas</Text>
            <Text style={styles.mutedText}>{stellaRevealedCards.length} reveladas</Text>
          </View>
          <Text style={styles.stellaWord}>{stellaWord || 'Sin palabra'}</Text>
          <Text style={styles.noticeText}>
            {isCurrentStellaScout
              ? hasCurrentUserFallen
                ? 'Has caido esta ronda. Espera al resto.'
                : 'Es tu turno. Revela una de tus cartas marcadas.'
              : `Turno de ${stellaCurrentScoutId || 'otro jugador'}.`}
          </Text>
          {stellaInTheDarkPlayerId ? (
            <Text style={styles.noticeText}>En la sombra: {stellaInTheDarkPlayerId}</Text>
          ) : null}
          <View style={styles.stellaCardGrid}>
            {stellaBoardCardIds.map((cardId, index) => {
              const isMine = myStellaMarks.includes(cardId);
              const isRevealed = stellaRevealedCards.includes(cardId);
              const canReveal = isCurrentStellaScout && isMine && !isRevealed && !hasCurrentUserFallen && !pendingActionType;

              return renderStellaCard(cardId, {
                selected: isMine,
                revealed: isRevealed,
                disabled: !canReveal,
                label: isRevealed ? 'Revelada' : isMine ? 'Tu marca' : undefined,
                keySuffix: index,
                onPress: canReveal ? () => revealStellaMark(cardId) : undefined,
              });
            })}
          </View>
          {isCurrentStellaScout && !hasCurrentUserFallen && revealableMarks.length === 0 ? (
            <Text style={styles.noticeText}>Ya no tienes marcas pendientes.</Text>
          ) : null}
          {stellaFallenPlayers.length > 0 ? (
            <Text style={styles.noticeText}>Caidos: {stellaFallenPlayers.join(', ')}</Text>
          ) : null}
        </View>
      );
    }

    if (currentPhase === 'SCORING') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Stella: puntuacion de ronda</Text>
          <Text style={styles.noticeText}>Palabra: {stellaWord || 'sin palabra'}</Text>
          {renderStellaScoreRows()}
          <TouchableOpacity style={[styles.actionButton, (!isSocketConnected || !!pendingActionType) && styles.actionButtonDisabled]} disabled={!isSocketConnected || !!pendingActionType} onPress={goNextRound}>
            <Text style={styles.actionButtonText}>
              {pendingActionType === 'NEXT_ROUND' ? 'Avanzando...' : 'Siguiente ronda'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentPhase === 'FINISHED') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>{didCurrentUserWin ? 'Has ganado' : 'Partida terminada'}</Text>
          <Text style={styles.noticeText}>
            {didCurrentUserWin
              ? 'Enhorabuena, has terminado en primera posicion.'
              : finalWinnerId
                ? `Ha ganado ${finalWinnerId}.`
                : 'Ya hay un ganador. Puedes revisar la puntuacion final abajo.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Stella</Text>
        <Text style={styles.noticeText}>Esperando una fase Stella jugable.</Text>
      </View>
    );
  };

  const renderPhasePanel = () => {
    if (!gameState) {
      return (
        <View style={styles.panel}>
          <ActivityIndicator color="#FCEEB5" />
          <Text style={styles.emptyText}>Esperando el estado inicial de la partida...</Text>
        </View>
      );
    }

    // Si hay un minijuego activo, mostrar panel específico y no la fase normal
    if (gameState.isMinigameActive) {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Minijuego en curso</Text>
          <Text style={styles.noticeText}>
            {activeConflictData
              ? isParticipant
                ? pendingScore !== null
                  ? `Minijuego completado con ${pendingScore} puntos. Esperando a que la partida se desbloquee.`
                  : activeConflict
                    ? 'Te toca resolver un conflicto. Si no ves el minijuego, espera un momento o reabre la partida.'
                    : 'Hay un conflicto activo. Esperando a recuperar el minijuego correcto.'
                : `Duelo entre ${activeConflictData.player1} y ${activeConflictData.player2}`
              : 'Espera a que termine el minijuego...'}
          </Text>
        </View>
      );
    }

    if (isStellaMode) {
      return renderStellaPhasePanel();
    }

    if (currentPhase === 'STORYTELLING') {
      if (isStoryteller) {
        return (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Tu turno: contar la historia</Text>
            <TextInput
              style={styles.clueInput}
              value={storyClue}
              onChangeText={setStoryClue}
              placeholder="Escribe la pista de la ronda"
              placeholderTextColor="#7b8a97"
            />
            <Text style={styles.noticeText}>Selecciona una carta de tu mano y envíala con la pista.</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!selectedHandCardId || !storyClue.trim() || !isSocketConnected || !!pendingActionType || storytellerAlreadyPlayed) && styles.actionButtonDisabled]}
              disabled={!selectedHandCardId || !storyClue.trim() || !isSocketConnected || !!pendingActionType || storytellerAlreadyPlayed}
              onPress={sendStory}
            >
              <Text style={styles.actionButtonText}>
                {storytellerAlreadyPlayed
                  ? 'Historia enviada'
                  : pendingActionType === 'SEND_STORY'
                    ? 'Enviando...'
                    : 'Enviar historia'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Esperando la pista</Text>
          <Text style={styles.noticeText}>El storyteller actual es {storytellerId || 'otro jugador'}.</Text>
        </View>
      );
    }

    if (currentPhase === 'SUBMISSION') {
      if (!isStoryteller) {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Envía tu carta</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!selectedHandCardId || !isSocketConnected || !!pendingActionType || playerAlreadySubmitted) && styles.actionButtonDisabled]}
              disabled={!selectedHandCardId || !isSocketConnected || !!pendingActionType || playerAlreadySubmitted}
              onPress={submitCard}
            >
              <Text style={styles.actionButtonText}>
                {playerAlreadySubmitted
                  ? 'Carta enviada'
                  : pendingActionType === 'SUBMIT_CARD'
                    ? 'Enviando...'
                    : 'Enviar carta'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Esperando al resto</Text>
        </View>
      );
    }

    if (currentPhase === 'VOTING') {
      if (!isStoryteller) {
        return (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Vota una carta</Text>
            <Text style={styles.noticeText}>No puedes votar tu propia carta.</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!selectedVoteCardId || !isSocketConnected || !!pendingActionType || playerAlreadyVoted) && styles.actionButtonDisabled]}
              disabled={!selectedVoteCardId || !isSocketConnected || !!pendingActionType || playerAlreadyVoted}
              onPress={castVote}
            >
              <Text style={styles.actionButtonText}>
                {playerAlreadyVoted
                  ? 'Voto enviado'
                  : pendingActionType === 'CAST_VOTE'
                    ? 'Enviando...'
                    : 'Confirmar voto'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Votación en curso</Text>
          <Text style={styles.noticeText}>Espera a que el resto vote tu carta.</Text>
        </View>
      );
    }

    if (currentPhase === 'SCORING') {
      
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Puntuación de la ronda</Text>
          <Text style={styles.noticeText}>Cartas jugadas: {Object.keys(currentRound?.playedCards ?? {}).length}</Text>
          <Text style={styles.noticeText}>Votos emitidos: {(currentRound?.votes ?? []).length}</Text>
          <TouchableOpacity style={[styles.actionButton, (!isSocketConnected || !!pendingActionType) && styles.actionButtonDisabled]} disabled={!isSocketConnected || !!pendingActionType} onPress={goNextRound}>
            <Text style={styles.actionButtonText}>
              {pendingActionType === 'NEXT_ROUND' ? 'Avanzando...' : 'Siguiente ronda'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentPhase === 'FINISHED') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>{didCurrentUserWin ? 'Has ganado' : 'Partida terminada'}</Text>
          <Text style={styles.noticeText}>
            {didCurrentUserWin
              ? 'Enhorabuena, has terminado en primera posicion.'
              : finalWinnerId
                ? `Ha ganado ${finalWinnerId}.`
                : 'Ya hay un ganador. Puedes revisar la puntuacion final abajo.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Esperando fase</Text>
        <Text style={styles.noticeText}>El backend aún no ha enviado una fase jugable.</Text>
      </View>
    );
  };

  if (!loaded && !error) return null;

  return (
    <ImageBackground source={require('../assets/images/background.jpg')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.titleContainer}
            onPress={() => {
              if (currentPhase === 'FINISHED') {
                void leaveFinishedGame();
                return;
              }
              router.replace('/menu');
            }}
          >
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="28" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chatToggleButton}
            onPress={() => setChatOpen((previous) => !previous)}
            activeOpacity={0.82}
          >
            <Ionicons name={chatOpen ? 'close' : 'chatbubbles-outline'} size={24} color="#FCEEB5" />
            {lobbyChatMessages.length > 0 ? (
              <View style={styles.chatToggleBadge}>
                <Text style={styles.chatToggleBadgeText}>{Math.min(lobbyChatMessages.length, 99)}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.clueHeroPanel, !visibleRoundPrompt && styles.clueHeroPanelIdle]}>
            <Text style={styles.clueHeroLabel}>{isStellaMode ? 'Palabra' : 'Pista'}</Text>
            <Text style={visibleRoundPrompt ? styles.clueHeroText : styles.clueHeroIdleText}>
              {visibleRoundPrompt || (isStellaMode ? 'Esperando palabra' : 'Esperando pista')}
            </Text>
          </View>

          {modeChangeOffer ? (
            <View style={styles.offerPanel}>
              <View style={styles.offerTextGroup}>
                <Text style={styles.offerTitle}>Cambio de modo</Text>
                <Text style={styles.offerText}>
                  {modeChangeOffer.message ?? `Quieres cambiar a ${modeChangeOffer.targetMode ?? 'otro modo'}?`}
                </Text>
              </View>
              <View style={styles.offerActions}>
                <TouchableOpacity style={styles.offerSecondaryButton} onPress={clearModeChangeOffer}>
                  <Text style={styles.offerSecondaryText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.offerPrimaryButton, pendingActionType === 'ACCEPT_MODE_CHANGE' && styles.actionButtonDisabled]}
                  onPress={acceptModeChangeOffer}
                  disabled={pendingActionType === 'ACCEPT_MODE_CHANGE'}
                >
                  <Text style={styles.offerPrimaryText}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {canResolveDuel ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Duelo disponible</Text>
              <Text style={styles.noticeText}>Has caido en una casilla de duelo. Elige rival para apostar 2 puntos.</Text>
              <View style={styles.targetList}>
                {availableDuelTargets.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    style={[styles.targetButton, pendingActionType === 'RESOLVE_DUEL' && styles.actionButtonDisabled]}
                    onPress={() => startDuelAgainst(player.id)}
                    disabled={pendingActionType === 'RESOLVE_DUEL'}
                  >
                    <Text style={styles.targetButtonText}>{player.id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {renderPhasePanel()}

          {currentPhase === 'FINISHED' ? (
            <>
              <View style={styles.panel}>
                <Text style={styles.sectionLabel}>Resultados</Text>
                {finalRanking.length > 0 ? (
                  finalRanking.map((entry) => (
                    <View key={entry.playerId} style={[styles.resultRow, entry.playerId === currentUserId && styles.resultRowSelf]}>
                      <View>
                        <Text style={styles.resultName}>
                          {entry.place}. {entry.playerId}
                          {entry.playerId === currentUserId ? ' (tu)' : ''}
                        </Text>
                        <Text style={styles.resultMeta}>{entry.points} puntos</Text>
                      </View>
                      <Text style={styles.resultCoins}>+{entry.coinsEarned}</Text>
                    </View>
                  ))
                ) : (
                  players
                    .slice()
                    .sort((a, b) => b.score - a.score)
                    .map((player, index) => (
                      <View key={player.id} style={[styles.resultRow, player.id === currentUserId && styles.resultRowSelf]}>
                        <View>
                          <Text style={styles.resultName}>
                            {index + 1}. {player.id}
                            {player.id === currentUserId ? ' (tu)' : ''}
                          </Text>
                          <Text style={styles.resultMeta}>{player.score} puntos</Text>
                        </View>
                      </View>
                    ))
                )}
              </View>

              <View style={styles.panel}>
                <Text style={styles.sectionLabel}>Cerrar partida</Text>
                <Text style={styles.noticeText}>Cuando quieras, puedes salir al menu y empezar otra sala.</Text>
                <TouchableOpacity style={styles.actionButton} onPress={leaveFinishedGame}>
                  <Text style={styles.actionButtonText}>Salir al menu</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {latestSpecialEvent ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Evento especial</Text>
              <Text style={styles.noticeText}>{formatSpecialEvent()}</Text>
            </View>
          ) : null}

          {!isStellaMode ? (
          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Tu mano</Text>
              <Text style={styles.mutedText}>{handCards.length} cartas</Text>
            </View>
            {handCards.length === 0 ? (
              <Text style={styles.emptyText}>Todavía no ha llegado tu mano privada.</Text>
            ) : (
              <View style={styles.cardGrid}>
                {handCards.map((card, index) => {
                  const selected = selectedHandCardId === card.id;
                  return (
                    <TouchableOpacity key={`${card.rawId}-${index}`} style={[styles.handCard, selected && styles.handCardSelected]} onPress={() => setSelectedHandCardId(card.id)}>
                      {card.url_image ? (
                        <Image source={{ uri: card.url_image }} style={styles.handCardImage} />
                      ) : (
                        <View style={styles.placeholderCardFace}>
                          <Text style={styles.placeholderCardId}>Carta {card.id}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
          ) : null}

          {currentPhase === 'VOTING' && !isStellaMode ? (
            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>{isStoryteller ? 'Cartas elegidas' : 'Cartas en mesa'}</Text>
                <Text style={styles.mutedText}>
                  {isStoryteller ? `${storytellerBoardCards.length} jugadas` : `${voteableBoardCards.length} opciones`}
                </Text>
              </View>
              {isStoryteller ? (
                <Text style={styles.noticeText}>Estas son las cartas que el resto ha jugado para tu pista.</Text>
              ) : null}
              <View style={styles.boardCardGrid}>
                {(isStoryteller ? storytellerBoardCards : voteableBoardCards).map((card, index) => {
                  const selected = selectedVoteCardId === card.id;
                  const imageUrl =
                    typeof card.url_image === 'string' && card.url_image.trim().length > 0
                      ? card.url_image
                      : getCardImageUrl(card.id);
                  return (
                    <TouchableOpacity
                      key={`board-${card.id}-${index}`}
                      style={[styles.boardCard, selected && styles.boardCardSelected, isStoryteller && styles.boardCardReadonly]}
                      disabled={isStoryteller}
                      onPress={() => setSelectedVoteCardId(card.id)}
                    >
                      {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={styles.boardCardImage} />
                      ) : (
                        <View style={styles.placeholderCardFace}>
                          <Text style={styles.boardCardLabel}>Carta</Text>
                          <Text style={styles.boardCardId}>{card.id}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Jugadores</Text>
              <Text style={styles.mutedText}>{players.length} en partida</Text>
            </View>
            {players.length === 0 ? (
              <Text style={styles.emptyText}>Todavía no ha llegado el estado del tablero.</Text>
            ) : (
              players.map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <View style={styles.playerIdentity}>
                    <View style={[styles.playerDot, { backgroundColor: player.connected ? '#2ecc71' : '#7f8c8d' }]} />
                    <View>
                      <Text style={styles.playerName}>{player.id}</Text>
                      <Text style={styles.playerMeta}>Puntos: {player.score} · Casilla: {player.score}</Text>
                    </View>
                  </View>
                  {player.id === currentUserId ? <Text style={styles.selfBadge}>Tu</Text> : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Tablero</Text>
            <View style={styles.boardCanvas}>
              <View style={styles.boardGrid}>
              {boardTiles.map((tile: any, index) => {
                const tileIndex = tile.index ?? tile.numero ?? index + 1;
                const tileType = tile.type ?? tile.tipo ?? 'normal';
                const occupants = players.filter((player) => player.score === tileIndex);
                const glyph = tileType !== 'normal' ? ['✦', '✧', '☽', '✶'][tileIndex % 4] : ['·', '✧', '✦'][tileIndex % 3];

                return (
                  <View
                    key={`${tileIndex}-${index}`}
                    style={[
                      styles.boardTile,
                      tileType !== 'normal' && styles.boardTileSpecial,
                      boardHasOverlay && styles.boardTileOverlay,
                    ]}
                  >
                    {!boardHasOverlay ? (
                      <>
                        <Text style={styles.boardTileGlyph}>{glyph}</Text>
                        <Text style={styles.boardTileText}>{tileIndex}</Text>
                      </>
                    ) : null}
                    {occupants.length > 0 ? (
                      <View style={styles.tileOccupants}>
                        {occupants.map((player) => (
                          <View key={player.id} style={styles.tileBadge}>
                            <Text style={styles.tileBadgeText}>{player.id.charAt(0).toUpperCase()}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              </View>
              {boardImageUrl ? (
                <Image
                  source={{ uri: boardImageUrl }}
                  style={styles.boardPreviewOverlay}
                  resizeMode="stretch"
                  onError={() => setBoardImageFailed(true)}
                  onLoad={() => setBoardImageFailed(false)}
                />
              ) : null}
            </View>
          </View>

          {false && pendingScore !== null && activeConflictData && isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Resolver duelo</Text>
              <Text style={styles.noticeText}>Tu minijuego terminó con {pendingScore} puntos. Elige el ganador final.</Text>
              <View style={styles.targetList}>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData?.player1 ?? '')}>
                  <Text style={styles.targetButtonText}>Gana {activeConflictData?.player1 ?? ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData?.player2 ?? '')}>
                  <Text style={styles.targetButtonText}>Gana {activeConflictData?.player2 ?? ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeConflictData && !isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Duelo en curso</Text>
              <Text style={styles.noticeText}>{activeConflictData.player1} y {activeConflictData.player2} están resolviendo un conflicto.</Text>
            </View>
          ) : null}
        </ScrollView>

        <DuelMinigameModal
          conflict={showConflictModal ? activeConflict : null}
          currentUserId={currentUserId}
          onClose={() => setShowConflictModal(false)}
          onResolved={(score) => {
            setPendingScore(score);
            if (isParticipant) {
              submitMinigameScore(score, resolvedLobbyCode);
            }
            if (activeConflictKey) {
              setCompletedConflictKey(activeConflictKey);
              void AsyncStorage.setItem(COMPLETED_CONFLICT_STORAGE_KEY, activeConflictKey);
              void AsyncStorage.setItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY, String(score));
            }
            setShowConflictModal(false);
          }}
        />
        {activeStar ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.starFlight,
              {
                left: `${starStartX}%`,
                top: `${starStartY}%`,
                opacity: starOpacity,
                transform: [{ translateX: starTranslateX }, { translateY: starTranslateY }, { scale: starScale }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.starButton}
              disabled={!currentUserId}
              activeOpacity={0.8}
              onPress={() => claimStar(currentUserId, resolvedLobbyCode)}
            >
              <Text style={styles.starGlyph}>✦</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
        {chatOpen ? (
          <TouchableOpacity
            style={styles.chatBackdrop}
            activeOpacity={1}
            onPress={() => setChatOpen(false)}
          />
        ) : null}
        <Animated.View
          pointerEvents={chatOpen ? 'auto' : 'none'}
          style={[
            styles.gameChatPanel,
            {
              transform: [
                {
                  translateX: chatPanelProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [viewportWidth * 0.9, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.gameChatHeader}>
            <View>
              <Text style={styles.gameChatTitle}>Chat</Text>
              <Text style={styles.gameChatMeta}>{resolvedLobbyCode || 'Sala'} · {isSocketConnected ? 'conectado' : 'sin socket'}</Text>
            </View>
            <TouchableOpacity style={styles.gameChatClose} onPress={() => setChatOpen(false)}>
              <Ionicons name="close" size={22} color="#FCEEB5" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.gameChatMessages} contentContainerStyle={styles.gameChatMessagesContent}>
            {lobbyChatMessages.length === 0 ? (
              <Text style={styles.gameChatEmpty}>Todavia no hay mensajes.</Text>
            ) : (
              lobbyChatMessages.map((message) => (
                <View key={message.id} style={styles.gameChatMessage}>
                  <Text style={styles.gameChatAuthor}>{message.username}</Text>
                  <Text style={styles.gameChatText}>{message.text}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.gameChatInputRow}>
            <TextInput
              style={styles.gameChatInput}
              value={chatText}
              onChangeText={setChatText}
              placeholder="Mensaje"
              placeholderTextColor="#8caea6"
              maxLength={255}
            />
            <TouchableOpacity
              style={[
                styles.gameChatSendButton,
                (!chatText.trim() || !isSocketConnected) && styles.gameChatSendButtonDisabled,
              ]}
              onPress={sendChatMessage}
              disabled={!chatText.trim() || !isSocketConnected}
            >
              <Ionicons name="send" size={18} color="#10212e" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'rgba(12, 28, 40, 0.78)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(252,238,181,0.2)',
  },
  titleContainer: { flex: 1, height: 50, marginRight: 10 },
  chatToggleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  chatToggleBadge: {
    position: 'absolute',
    top: 3,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FCEEB5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chatToggleBadgeText: {
    color: '#10212e',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 44 },
  clueHeroPanel: {
    backgroundColor: 'rgba(8, 19, 29, 0.96)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#FCEEB5',
    alignItems: 'center',
  },
  clueHeroPanelIdle: {
    borderColor: 'rgba(252,238,181,0.28)',
  },
  clueHeroLabel: {
    color: '#8caea6',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  clueHeroText: {
    color: '#FCEEB5',
    fontFamily: 'FuenteTitulo',
    fontSize: 34,
    textAlign: 'center',
  },
  clueHeroIdleText: {
    color: '#d7dce2',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  offerPanel: {
    backgroundColor: 'rgba(8, 19, 29, 0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FCEEB5',
    padding: 14,
    gap: 12,
  },
  offerTextGroup: { gap: 5 },
  offerTitle: { color: '#FCEEB5', fontSize: 17, fontWeight: 'bold' },
  offerText: { color: '#d7dce2', fontSize: 13, lineHeight: 19 },
  offerActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  offerSecondaryButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.34)',
  },
  offerSecondaryText: { color: '#FCEEB5', fontWeight: 'bold' },
  offerPrimaryButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FCEEB5',
  },
  offerPrimaryText: { color: '#10212e', fontWeight: 'bold' },
  panel: { backgroundColor: 'rgba(30, 60, 75, 0.85)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(252,238,181,0.18)', gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionLabel: { color: '#FCEEB5', fontSize: 18, fontWeight: 'bold' },
  mutedText: { color: '#a0b0b9', fontSize: 12 },
  noticeText: { color: '#d7dce2', lineHeight: 20 },
  emptyText: { color: '#d7dce2', textAlign: 'center', lineHeight: 20 },
  clueInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#10212e',
  },
  actionButton: { alignSelf: 'flex-start', backgroundColor: '#FCEEB5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  actionButtonDisabled: { opacity: 0.45 },
  actionButtonText: { color: '#10212e', fontWeight: 'bold' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  handCard: {
    width: 96,
    height: 138,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.16)',
  },
  handCardSelected: {
    borderColor: '#FCEEB5',
    transform: [{ translateY: -6 }],
  },
  handCardImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCardFace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  placeholderCardId: {
    color: '#FCEEB5',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  boardCardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  boardCard: {
    width: 88,
    height: 124,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  boardCardImage: {
    width: '100%',
    height: '100%',
  },
  boardCardSelected: {
    borderColor: '#FCEEB5',
    backgroundColor: 'rgba(252,238,181,0.16)',
  },
  boardCardReadonly: {
    opacity: 0.96,
  },
  boardCardLabel: {
    color: '#8caea6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  boardCardId: {
    color: '#FCEEB5',
    fontSize: 24,
    fontWeight: 'bold',
  },
  stellaWord: {
    color: '#FCEEB5',
    fontSize: 24,
    fontWeight: 'bold',
  },
  stellaCardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  stellaCard: {
    width: 92,
    height: 132,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.16)',
    position: 'relative',
  },
  stellaCardSelected: {
    borderColor: '#FCEEB5',
    backgroundColor: 'rgba(252,238,181,0.16)',
  },
  stellaCardRevealed: {
    borderColor: '#A8C8C0',
  },
  stellaCardDisabled: {
    opacity: 0.78,
  },
  stellaCardImage: {
    width: '100%',
    height: '100%',
  },
  stellaCardBadge: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(8, 19, 29, 0.86)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  stellaCardBadgeText: {
    color: '#FCEEB5',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  scoreList: { gap: 10 },
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerDot: { width: 12, height: 12, borderRadius: 999 },
  playerName: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 16 },
  playerMeta: { color: '#d7dce2', marginTop: 4, fontSize: 12 },
  selfBadge: { color: '#10212e', backgroundColor: '#A8C8C0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontWeight: 'bold' },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.12)',
  },
  resultRowSelf: {
    borderColor: '#FCEEB5',
    backgroundColor: 'rgba(252,238,181,0.14)',
  },
  resultName: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 16 },
  resultMeta: { color: '#d7dce2', marginTop: 4, fontSize: 12 },
  resultCoins: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 16 },
  boardCanvas: {
    width: '100%',
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  boardPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    zIndex: 1,
  },
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', position: 'relative', zIndex: 2 },
  boardTile: {
    width: 48,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(18, 30, 48, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
  },
  boardTileSpecial: {
    backgroundColor: 'rgba(88, 53, 109, 0.94)',
    borderColor: '#FCEEB5',
  },
  boardTileOverlay: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  boardTileGlyph: {
    color: '#FCEEB5',
    fontSize: 12,
    marginBottom: 2,
    opacity: 0.85,
  },
  boardTileText: { color: '#dfe7ef', fontWeight: 'bold', fontSize: 11 },
  tileOccupants: { position: 'absolute', bottom: -6, flexDirection: 'row', gap: 2 },
  tileBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: '#2c3e50',
  },
  tileBadgeText: { color: '#FCEEB5', fontSize: 8, fontWeight: 'bold' },
  starFlight: {
    position: 'absolute',
    zIndex: 20,
  },
  starButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(252,238,181,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.75)',
    shadowColor: '#FCEEB5',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  starGlyph: {
    color: '#FCEEB5',
    fontSize: 28,
    fontWeight: 'bold',
  },
  chatBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  gameChatPanel: {
    position: 'absolute',
    top: 74,
    right: 0,
    bottom: 0,
    width: '84%',
    backgroundColor: 'rgba(8, 19, 29, 0.98)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(252,238,181,0.35)',
    padding: 14,
    gap: 12,
  },
  gameChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(252,238,181,0.18)',
  },
  gameChatTitle: {
    color: '#FCEEB5',
    fontSize: 20,
    fontWeight: 'bold',
  },
  gameChatMeta: {
    color: '#8caea6',
    marginTop: 2,
    fontSize: 12,
  },
  gameChatClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameChatMessages: {
    flex: 1,
  },
  gameChatMessagesContent: {
    paddingBottom: 10,
  },
  gameChatEmpty: {
    color: '#a0b0b9',
    textAlign: 'center',
    paddingVertical: 24,
  },
  gameChatMessage: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.1)',
  },
  gameChatAuthor: {
    color: '#FCEEB5',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  gameChatText: {
    color: '#d7dce2',
    lineHeight: 19,
  },
  gameChatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(252,238,181,0.18)',
  },
  gameChatInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FCEEB5',
  },
  gameChatSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FCEEB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameChatSendButtonDisabled: {
    opacity: 0.45,
  },
  targetList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  targetButton: { backgroundColor: '#A8C8C0', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14 },
  targetButtonText: { color: '#10212e', fontWeight: 'bold' },
});
