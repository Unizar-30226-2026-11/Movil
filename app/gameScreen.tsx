import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Modal,
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

type HandCard = {
  id: number;
  rawId: string;
  url_image: string | null;
};

type BoardCard = {
  id: number;
  url_image: string | null;
  playerId?: string;
};

type PrivateHandItem = number | Record<string, any>;

type StellaMarks = Record<string, number[]>;
type StellaRoundScores = Record<string, number>;
type PlayableConflictData = {
  player1: string;
  player2: string;
  isDuel: boolean;
  type: 0 | 1 | 2;
  duration: number;
};
type ConflictLike = Partial<PlayableConflictData> | null | undefined;
type HandModifierData = {
  type?: string;
  value?: number;
  turnsLeft?: number;
};
type BoardTileLayout = {
  x: number;
  y: number;
  size?: 'normal' | 'wide' | 'finish';
};
type BoardTileKind =
  | 'normal'
  | 'odd'
  | 'even'
  | 'bonus'
  | 'shuffle'
  | 'duel'
  | 'checkpoint'
  | 'finish';

const COMPLETED_CONFLICT_STORAGE_KEY = 'completedConflictKey';
const COMPLETED_CONFLICT_RESULT_STORAGE_KEY = 'completedConflictResult';
const HAND_LIMIT_MINUS_IMAGE = require('../modificador_hand_limit.png');
const HAND_LIMIT_PLUS_IMAGE = require('../modificar_hand_limit_plus.png');

const FALLBACK_BOARD = Array.from({ length: 42 }, (_, index) => ({
  index: index + 1,
  type: [5, 7, 9, 10, 11, 18, 21, 25, 27, 31, 34, 37, 40].includes(index + 1) ? 'special' : 'normal',
}));
const BOARD_LAYOUT: Record<number, BoardTileLayout> = {
  1: { x: 4, y: 3 }, 2: { x: 21, y: 5 }, 3: { x: 37, y: 2 }, 4: { x: 53, y: 5 }, 5: { x: 69, y: 2 }, 6: { x: 84, y: 6 },
  12: { x: 6, y: 19 }, 11: { x: 20, y: 16 }, 10: { x: 38, y: 19 }, 9: { x: 52, y: 16 }, 8: { x: 68, y: 19 }, 7: { x: 84, y: 15 },
  13: { x: 4, y: 33 }, 14: { x: 22, y: 31 }, 15: { x: 37, y: 34 }, 16: { x: 54, y: 31 }, 17: { x: 70, y: 34 }, 18: { x: 84, y: 30 },
  24: { x: 6, y: 49 }, 23: { x: 20, y: 46 }, 22: { x: 38, y: 49 }, 21: { x: 52, y: 46 }, 20: { x: 68, y: 49 }, 19: { x: 84, y: 45 },
  25: { x: 4, y: 63 }, 26: { x: 22, y: 61 }, 27: { x: 37, y: 64 }, 28: { x: 54, y: 61 }, 29: { x: 70, y: 64 }, 30: { x: 84, y: 60 },
  36: { x: 6, y: 79 }, 35: { x: 20, y: 76 }, 34: { x: 38, y: 79 }, 33: { x: 52, y: 76 }, 32: { x: 68, y: 79 }, 31: { x: 84, y: 75 },
  37: { x: 4, y: 92 }, 38: { x: 21, y: 89 }, 39: { x: 37, y: 93 }, 40: { x: 53, y: 89 }, 41: { x: 69, y: 92 }, 42: { x: 82, y: 90, size: 'finish' },
};
const TILE_KIND_BY_INDEX: Record<number, BoardTileKind> = {
  5: 'odd',
  7: 'even',
  9: 'odd',
  10: 'bonus',
  11: 'even',
  18: 'shuffle',
  21: 'bonus',
  25: 'duel',
  27: 'checkpoint',
  31: 'bonus',
  34: 'shuffle',
  37: 'bonus',
  40: 'duel',
  42: 'finish',
};

const normalizeCardId = (value: string | number) => Number(String(value).replace(/\D/g, ''));

const normalizeConflictType = (value: unknown): 0 | 1 | 2 | null => {
  const parsed = Number(value);
  return parsed === 0 || parsed === 1 || parsed === 2 ? parsed : null;
};

const normalizeConflictDuration = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sameConflictParticipants = (left: ConflictLike, right: ConflictLike) => {
  const leftKey = [left?.player1, left?.player2].filter(Boolean).map(String).sort().join(':');
  const rightKey = [right?.player1, right?.player2].filter(Boolean).map(String).sort().join(':');
  return Boolean(leftKey && rightKey && leftKey === rightKey);
};

const mergePlayableConflict = (
  stateConflict: ConflictLike,
  eventConflict: ConflictLike
): PlayableConflictData | null => {
  const participantSource =
    stateConflict?.player1 && stateConflict?.player2 ? stateConflict : eventConflict;
  const canUseEventDetails =
    !stateConflict?.player1 ||
    !stateConflict?.player2 ||
    sameConflictParticipants(stateConflict, eventConflict);
  const detailSource =
    normalizeConflictType(stateConflict?.type) !== null && normalizeConflictDuration(stateConflict?.duration) !== null
      ? stateConflict
      : canUseEventDetails
        ? eventConflict
        : null;

  const player1 = String(participantSource?.player1 ?? '').trim();
  const player2 = String(participantSource?.player2 ?? '').trim();
  const type = normalizeConflictType(detailSource?.type);
  const duration = normalizeConflictDuration(detailSource?.duration);

  if (!player1 || !player2 || type === null || duration === null) return null;

  return {
    player1,
    player2,
    isDuel: Boolean(participantSource?.isDuel ?? detailSource?.isDuel),
    type,
    duration,
  };
};

const getImageUrl = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const getPrivateHandItemImageUrl = (item: PrivateHandItem) => {
  if (typeof item === 'number') return null;

  return (
    getImageUrl(item.url_image) ??
    getImageUrl(item.imageUrl) ??
    getImageUrl(item.image_url) ??
    getImageUrl(item.url) ??
    getImageUrl(item.board?.url_image) ??
    getImageUrl(item.board?.imageUrl) ??
    null
  );
};

const isPrivateHandBoardItem = (item: PrivateHandItem) => {
  if (typeof item === 'number') return false;

  const typeValue = String(item.type ?? item.kind ?? item.itemType ?? item.entityType ?? '').toLowerCase();
  const idValue = String(item.id ?? item.id_board ?? item.boardId ?? '').toLowerCase();
  const imageUrl = String(getPrivateHandItemImageUrl(item) ?? '').toLowerCase();

  return Boolean(
    item.board ||
      item.id_board != null ||
      item.boardId != null ||
      typeValue.includes('board') ||
      typeValue.includes('tablero') ||
      idValue.startsWith('b_') ||
      idValue.includes('board') ||
      idValue.includes('tablero') ||
      imageUrl.includes('/boards/') ||
      imageUrl.includes('/tableros/') ||
      imageUrl.includes('board') ||
      imageUrl.includes('tablero')
  );
};

const extractPrivateHandBoardImageUrl = (items: PrivateHandItem[]) => {
  const boardItem = items.find(isPrivateHandBoardItem);
  return boardItem ? getPrivateHandItemImageUrl(boardItem) : null;
};

const getBoardStateImageUrl = (board: unknown) => {
  if (!board || typeof board !== 'object') return null;

  const boardValue = board as Record<string, any>;
  return (
    getImageUrl(boardValue.url_image) ??
    getImageUrl(boardValue.imageUrl) ??
    getImageUrl(boardValue.image_url) ??
    getImageUrl(boardValue.url) ??
    getImageUrl(boardValue.board?.url_image) ??
    getImageUrl(boardValue.board?.imageUrl) ??
    null
  );
};

const normalizeNumberList = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];

const normalizeHandModifier = (value: unknown): HandModifierData | null => {
  if (!value || typeof value !== 'object') return null;

  const modifier = value as Record<string, unknown>;
  const type = String(modifier.type ?? '').trim().toUpperCase();
  const numericValue = Number(modifier.value ?? 0);
  const turnsLeft = Number(modifier.turnsLeft ?? modifier.turns_left ?? 0);

  if (type !== 'HAND_LIMIT' || !Number.isFinite(numericValue) || numericValue === 0) {
    return null;
  }

  return {
    type,
    value: numericValue,
    turnsLeft: Number.isFinite(turnsLeft) ? turnsLeft : 0,
  };
};

const getTileKind = (tileIndex: number, tileType: unknown): BoardTileKind => {
  const normalizedType = String(tileType ?? '').trim().toLowerCase();

  if (normalizedType.includes('finish') || normalizedType.includes('meta')) return 'finish';
  if (normalizedType.includes('duel')) return 'duel';
  if (normalizedType.includes('shuffle') || normalizedType.includes('swap')) return 'shuffle';
  if (normalizedType.includes('checkpoint') || normalizedType.includes('balance')) return 'checkpoint';
  if (normalizedType.includes('bonus') || normalizedType.includes('mode')) return 'bonus';
  if (normalizedType.includes('odd') || normalizedType.includes('impar')) return 'odd';
  if (normalizedType.includes('even') || normalizedType.includes('par')) return 'even';

  return TILE_KIND_BY_INDEX[tileIndex] ?? 'normal';
};

const getTileIconName = (tileKind: BoardTileKind) => {
  switch (tileKind) {
    case 'bonus': return 'star';
    case 'shuffle': return 'shuffle';
    case 'duel': return 'flash';
    default: return null;
  }
};

const getTileBadgeText = (tileKind: BoardTileKind) => {
  switch (tileKind) {
    case 'odd': return '+/-';
    case 'even': return '-/+';
    case 'checkpoint': return 'EQ';
    case 'finish': return 'FIN';
    default: return null;
  }
};

const extractCurrentUserHandModifier = (
  activeModifiers: unknown,
  currentUserId: string
): HandModifierData | null => {
  if (!activeModifiers || typeof activeModifiers !== 'object' || !currentUserId) return null;

  const modifiers = activeModifiers as Record<string, unknown>;
  const directModifier = normalizeHandModifier(modifiers[currentUserId]);
  if (directModifier) return directModifier;

  const nestedModifiers =
    modifiers.hand_modifiers ??
    modifiers.handModifiers ??
    modifiers.players ??
    null;

  if (nestedModifiers && typeof nestedModifiers === 'object') {
    const nestedModifier = normalizeHandModifier(
      (nestedModifiers as Record<string, unknown>)[currentUserId]
    );
    if (nestedModifier) return nestedModifier;
  }

  return null;
};

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
  const completedConflictKeyRef = useRef<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<string | null>(null);
  const [catalogCardUrls, setCatalogCardUrls] = useState<Record<string, string>>({});
  const [knownCardUrls, setKnownCardUrls] = useState<Record<string, string>>({});
  const [lastKnownStellaPrompt, setLastKnownStellaPrompt] = useState('');
  const [boardImageFailed, setBoardImageFailed] = useState(false);
  const [lastKnownBoardImageUrl, setLastKnownBoardImageUrl] = useState<string | null>(null);
  const [boardInspectorMode, setBoardInspectorMode] = useState<'clue' | 'board'>('clue');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const emitGameActionRef = useRef(emitGameAction);
  const starProgress = useRef(new Animated.Value(0)).current;
  const modeShiftPulse = useRef(new Animated.Value(0)).current;
  const chatPanelProgress = useRef(new Animated.Value(0)).current;
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  useEffect(() => {
    emitGameActionRef.current = emitGameAction;
  }, [emitGameAction]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(modeShiftPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(modeShiftPulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      modeShiftPulse.stopAnimation();
      modeShiftPulse.setValue(0);
    };
  }, [modeShiftPulse]);

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

        let ownedCardEntries: readonly [string, string][] = [];
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
              .filter(Boolean) as readonly [string, string][];
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
  const liveRoundPrompt = String(currentRound?.clue ?? currentRound?.word ?? '').trim();
  const storytellerId = String(currentRound?.storytellerId ?? '');
  const isStoryteller = storytellerId === currentUserId;
  const playedCards = useMemo(() => currentRound?.playedCards ?? {}, [currentRound?.playedCards]);
  const votes = useMemo(() => currentRound?.votes ?? [], [currentRound?.votes]);
  const storytellerAlreadyPlayed =
    currentRound?.storytellerCardId != null || playedCards[storytellerId] != null;
  const playerAlreadySubmitted = playedCards[currentUserId] != null;
  const recoveredSelectedVoteCardId = normalizeCardId(currentRound?.selectedVoteCardId ?? '');
  const hasRecoveredSelectedVote =
    currentRound?.selectedVoteCardId != null && Number.isFinite(recoveredSelectedVoteCardId);
  const playerAlreadyVoted =
    votes.some((vote) => vote.voterId === currentUserId) || hasRecoveredSelectedVote;
  const scores = gameState?.scores ?? {};
  const playerNames = useMemo(
    () =>
      gameState?.playerNames && typeof gameState.playerNames === 'object'
        ? gameState.playerNames
        : {},
    [gameState?.playerNames]
  );
  const getPlayerName = useCallback(
    (playerId?: string | null, options?: { self?: boolean }) => {
      const safeId = String(playerId ?? '').trim();
      if (!safeId) return 'Jugador';
      if (options?.self && safeId === currentUserId) return 'Tu';
      const resolvedName = String(playerNames[safeId] ?? '').trim();
      return resolvedName || safeId;
    },
    [currentUserId, playerNames]
  );
  const getPlayerBadgeName = useCallback(
    (playerId?: string | null) => {
      if (playerId === currentUserId) return 'TU';
      const name = getPlayerName(playerId);
      return name.slice(0, 3).toUpperCase();
    },
    [currentUserId, getPlayerName]
  );
  const players = (gameState?.players ?? []).map((playerId) => ({
    id: String(playerId),
    name: getPlayerName(String(playerId)),
    score: scores[String(playerId)] ?? 0,
    connected: !(gameState?.disconnectedPlayers ?? []).includes(String(playerId)),
  }));

  useEffect(() => {
    if (currentPhase !== 'VOTING' || !hasRecoveredSelectedVote) return;
    setSelectedVoteCardId(recoveredSelectedVoteCardId);
  }, [currentPhase, hasRecoveredSelectedVote, recoveredSelectedVoteCardId]);

  const privateHandItems = useMemo(() => privateHand as PrivateHandItem[], [privateHand]);
  const privateHandBoardImageUrl = useMemo(
    () => extractPrivateHandBoardImageUrl(privateHandItems),
    [privateHandItems]
  );

  const handCards = useMemo<HandCard[]>(
    () => {
      const uniqueCards = new Map<number, HandCard>();

      privateHandItems
        .filter((card) => !isPrivateHandBoardItem(card))
        .map((card, index) => {
          if (typeof card === 'number') {
            return {
              id: card,
              rawId: String(card),
              url_image: null,
            };
          }

          const numericId = normalizeCardId(card.id ?? card.cardId ?? card.id_card ?? '');
          const imageUrl = getPrivateHandItemImageUrl(card);
          return {
            id: numericId || index + 1,
            rawId: String(card.id ?? card.cardId ?? card.id_card ?? numericId),
            url_image: imageUrl,
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
    [privateHandItems]
  );

  const boardCardsDetailed = currentRound?.boardCardsDetailed;
  const boardCards = useMemo<BoardCard[]>(
    () => {
      if (Array.isArray(boardCardsDetailed) && boardCardsDetailed.length > 0) {
        return boardCardsDetailed.reduce<BoardCard[]>((acc, card) => {
          const id = normalizeCardId(card.id ?? card.cardId ?? card.id_card ?? '');
          const url = typeof card.url_image === 'string' && card.url_image.trim().length > 0
            ? card.url_image
            : null;
          const playerId = String(card.playerId ?? card.player_id ?? card.ownerId ?? card.owner_id ?? card.playedBy ?? '').trim();

          if (Number.isFinite(id) && id > 0) {
            const newCard: BoardCard = { id, url_image: url };
            if (playerId) {
              newCard.playerId = playerId;
            }
            acc.push(newCard);
          }

          return acc;
        }, []);
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
  const visibleRoundPrompt = isStellaMode
    ? liveRoundPrompt || lastKnownStellaPrompt
    : liveRoundPrompt;
  const effectiveStellaPrompt = (stellaWord || liveRoundPrompt || lastKnownStellaPrompt).trim();
  const currentHandModifier = extractCurrentUserHandModifier(gameState?.activeModifiers, currentUserId);

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
    const boardCardUrlsById = boardCards.reduce<Record<string, string>>((acc, card) => {
      if (typeof card.url_image === 'string' && card.url_image.trim().length > 0) {
        acc[String(card.id)] = card.url_image;
      }
      return acc;
    }, {});

    if (Object.keys(normalizedPlayedCards).length > 0) {
      return Object.entries(normalizedPlayedCards).map(([playerId, cardId]) => ({
        id: cardId,
        playerId,
        url_image: boardCardUrlsById[String(cardId)] ?? knownCardUrls[String(cardId)] ?? null,
      }));
    }

    return boardCards;
  }, [boardCards, knownCardUrls, normalizedPlayedCards]);
  const voteCountsByCardId = useMemo(
    () =>
      votes.reduce<Record<string, number>>((acc, vote) => {
        const targetCardId = normalizeCardId(vote.targetCardId);
        if (!Number.isFinite(targetCardId)) return acc;
        const key = String(targetCardId);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    [votes]
  );
  const voteableBoardCards = playedBoardCards.filter((card) => card.playerId !== currentUserId);
  const storytellerBoardCards = playedBoardCards.filter((card) => card.playerId !== currentUserId);
  const boardTiles = Array.isArray(gameState?.board?.tiles) && gameState.board.tiles.length > 0 ? gameState.board.tiles : FALLBACK_BOARD;
  const currentBoardImageUrl = getBoardStateImageUrl(gameState?.board) ?? privateHandBoardImageUrl;
  const boardImageUrl = currentBoardImageUrl ?? lastKnownBoardImageUrl;
  const boardHasOverlay = Boolean(boardImageUrl && !boardImageFailed);

  const playableConflictData = mergePlayableConflict(gameState?.activeConflict, activeConflict);
  const activeConflictData = playableConflictData ?? gameState?.activeConflict ?? activeConflict ?? null;
  const activeConflictKey = activeConflictData
    ? (() => {
        const participantKey = [activeConflictData.player1, activeConflictData.player2]
          .filter(Boolean)
          .sort()
          .join(':');
        const conflictType = playableConflictData?.type ?? activeConflict?.type ?? gameState?.activeConflict?.type ?? 'pending';
        const conflictMode = activeConflictData.isDuel ? 'duel' : 'tie';
        return `${participantKey}:${conflictType}:${conflictMode}`;
      })()
    : null;
  const activeConflictDuration = playableConflictData?.duration ?? activeConflict?.duration ?? gameState?.activeConflict?.duration;
  const isParticipant =
    activeConflictData?.player1 === currentUserId || activeConflictData?.player2 === currentUserId;
  const fallbackWinnerId = gameState?.winners?.[0] ?? players.slice().sort((a, b) => b.score - a.score)[0]?.id;
  const finalWinnerId = finalRanking[0]?.playerId ?? fallbackWinnerId ?? '';
  const didCurrentUserWin = Boolean(currentUserId && finalWinnerId === currentUserId);
  const availableDuelTargets = players.filter((player) => player.id !== currentUserId);
  const canResolveDuel = Boolean(duelAvailableFor && duelAvailableFor === currentUserId && currentPhase === 'SCORING' && !gameState?.isMinigameActive);

  const formatSpecialEvent = () => {
    if (!latestSpecialEvent) return '';

    const playerLabel = latestSpecialEvent.pId ? getPlayerName(latestSpecialEvent.pId) : 'Un jugador';
    const targetLabel = typeof latestSpecialEvent.targetId === 'string' ? getPlayerName(latestSpecialEvent.targetId) : 'otro jugador';
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
          : `${latestSpecialEvent.effect ?? 'Evento especial'}${latestSpecialEvent.pId ? ` para ${getPlayerName(latestSpecialEvent.pId)}` : ''}.`;
    }
  };

  useEffect(() => {
    setSelectedStellaCardIds([]);
  }, [stellaBoardKey]);

  useEffect(() => {
    if (!isStellaMode) {
      setLastKnownStellaPrompt('');
      return;
    }

    if (liveRoundPrompt) {
      setLastKnownStellaPrompt(liveRoundPrompt);
    }
  }, [isStellaMode, liveRoundPrompt]);

  useEffect(() => {
    setBoardImageFailed(false);
  }, [boardImageUrl]);

  useEffect(() => {
    if (currentBoardImageUrl) {
      setLastKnownBoardImageUrl(currentBoardImageUrl);
    }
  }, [currentBoardImageUrl]);

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
      completedConflictKeyRef.current = null;
      void AsyncStorage.removeItem(COMPLETED_CONFLICT_STORAGE_KEY);
      void AsyncStorage.removeItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);
      return;
    }

    if (
      isParticipant &&
      completedConflictKey !== activeConflictKey &&
      completedConflictKeyRef.current !== activeConflictKey
    ) {
      setShowConflictModal(true);
    }
  }, [activeConflictData, activeConflictKey, completedConflictKey, isParticipant]);

  useEffect(() => {
    const hydrateCompletedConflict = async () => {
      if (!activeConflictKey) return;

      const storedConflictKey = await AsyncStorage.getItem(COMPLETED_CONFLICT_STORAGE_KEY);
      const storedConflictResult = await AsyncStorage.getItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);

      if (storedConflictKey === activeConflictKey) {
        completedConflictKeyRef.current = activeConflictKey;
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

  const renderBoardInspector = () => {
    const getTileColors = (kind: BoardTileKind) => {
      switch(kind) {
        case 'odd': return { bg: '#ea72bd', border: '#973070', text: '#5b143d', badgeBg: 'rgba(255, 239, 249, 0.92)' };
        case 'even': return { bg: '#6dafee', border: '#2e68a5', text: '#173d68', badgeBg: 'rgba(238, 247, 255, 0.94)' };
        case 'bonus': return { bg: '#a69cff', border: '#5d50c4', text: '#172056', badgeBg: 'rgba(238, 250, 255, 0.96)' };
        case 'shuffle': return { bg: '#9f78df', border: '#6536a4', text: '#401568', badgeBg: 'rgba(247, 239, 255, 0.94)' };
        case 'duel': return { bg: '#e86d5b', border: '#972d21', text: '#5a1912', badgeBg: 'rgba(255, 241, 238, 0.94)' };
        case 'checkpoint': return { bg: '#62cacd', border: '#23777b', text: '#113d3f', badgeBg: 'rgba(238, 255, 255, 0.94)' };
        case 'finish': return { bg: '#f3b948', border: '#5f3d09', text: '#4b2a05', badgeBg: 'rgba(255, 253, 226, 0.84)' };
        default: return { bg: '#b8dda9', border: '#2b7940', text: '#183b23', badgeBg: 'rgba(255, 255, 255, 0.88)' };
      }
    };

    return (
      <View style={styles.boardCanvas}>
        {boardImageUrl ? (
          <Image
            source={{ uri: boardImageUrl }}
            style={styles.boardPreviewOverlay}
            resizeMode="cover"
            onError={() => setBoardImageFailed(true)}
            onLoad={() => setBoardImageFailed(false)}
          />
        ) : null}
        <View style={styles.boardGrid}>
          {boardTiles.map((tile: any, index) => {
            const tileIndex = tile.index ?? tile.numero ?? index + 1;
            const tileType = tile.type ?? tile.tipo ?? 'normal';
            const tileKind = getTileKind(tileIndex, tileType);
            const occupants = players.filter((player) => Math.max(1, player.score) === tileIndex);
            const tileLayout = BOARD_LAYOUT[tileIndex] ?? {
              x: 6 + ((index % 7) * 9),
              y: Math.floor(index / 7) * 18,
              size: 'normal' as const,
            };
            const tileIconName = getTileIconName(tileKind);
            const tileBadgeText = getTileBadgeText(tileKind);
            const isDiamond = tileKind === 'bonus' || tileKind === 'shuffle';
            const colors = getTileColors(tileKind);

            return (
              <Animated.View
                key={`${tileIndex}-${index}`}
                style={[
                  styles.boardTile,
                  tileLayout.size === 'wide' && styles.boardTileWide,
                  tileKind === 'finish' && styles.boardTileFinish,
                  isDiamond && styles.boardTileShapeDiamond,
                  boardHasOverlay && styles.boardTileOverlay,
                  {
                    left: `${tileLayout.x}%`,
                    top: `${tileLayout.y}%`,
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    transform: [
                      ...(isDiamond ? [{ rotate: '45deg' }] : []),
                      ...(tileKind === 'bonus' ? [{
                        scale: modeShiftPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.06],
                        }),
                      }] : [])
                    ]
                  },
                ]}
              >
                <View style={[styles.boardTileInnerLayer, isDiamond && styles.boardTileInnerLayerDiamond]}>
                  <View style={[styles.boardTileContent, isDiamond && styles.boardTileContentCounterRotate]}>
                    <Text style={[styles.boardTileIndex, { color: colors.text }]}>{tileIndex}</Text>

                    {tileIconName || (tileBadgeText) ? (
                      <View style={[styles.boardTileBadge, { backgroundColor: colors.badgeBg }]}>
                        {tileIconName ? (
                          <Ionicons name={tileIconName} size={11} color={colors.text} />
                        ) : (
                          <Text style={[styles.boardTileBadgeText, { color: colors.text }]}>{tileBadgeText}</Text>
                        )}
                      </View>
                    ) : null}

                    {occupants.length > 0 ? (
                      <View style={styles.tileOccupants}>
                        {occupants.map((player) => {
                          return (
                            <View key={player.id} style={styles.tileBadge}>
                              <Text style={styles.tileBadgeText}>
                                {getPlayerBadgeName(player.id)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </View>
    );
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
              {player.name}
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

  const renderVoteSummary = () => {
    if (playedBoardCards.length === 0) {
      return <Text style={styles.emptyText}>Todavia no han llegado las cartas jugadas.</Text>;
    }

    return (
      <View style={styles.voteSummaryGrid}>
        {playedBoardCards.map((card, index) => {
          const imageUrl =
            typeof card.url_image === 'string' && card.url_image.trim().length > 0
              ? card.url_image
              : getCardImageUrl(card.id);
          const voteCount = voteCountsByCardId[String(card.id)] ?? 0;
          const ownerName = card.playerId ? getPlayerName(card.playerId) : '';

          return (
            <View key={`scoring-card-${card.playerId ?? 'card'}-${card.id}-${index}`} style={styles.voteSummaryCard}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.voteSummaryImage} />
              ) : (
                <View style={styles.placeholderCardFace}>
                  <Text style={styles.boardCardLabel}>Carta</Text>
                  <Text style={styles.boardCardId}>{card.id}</Text>
                </View>
              )}
              <View style={styles.voteSummaryBadge}>
                <Text style={styles.voteSummaryBadgeText}>{voteCount}</Text>
                <Ionicons name="checkmark-circle" size={14} color="#10212e" />
              </View>
              {ownerName ? (
                <View style={styles.voteSummaryOwner}>
                  <Text style={styles.voteSummaryOwnerText} numberOfLines={1}>{ownerName}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  const renderStellaPhasePanel = () => {
    const submittedPlayersCount = Object.keys(stellaPlayerMarks).length;
    const revealableMarks = myStellaMarks.filter((cardId) => !stellaRevealedCards.includes(cardId));

    if (currentPhase === 'STELLA_WORD_REVEAL') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Stella: palabra de la ronda</Text>
          <Text style={styles.stellaWord}>{effectiveStellaPrompt || 'Esperando palabra...'}</Text>
          <Text style={styles.noticeText}>
            Cuando el backend abra la ronda podras marcar entre 1 y 10 cartas.
          </Text>
          <Text style={styles.noticeText}>
            Esperando al temporizador del servidor para iniciar el marcaje.
          </Text>
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
          <Text style={styles.stellaWord}>{effectiveStellaPrompt || 'Sin palabra'}</Text>
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
          <Text style={styles.stellaWord}>{effectiveStellaPrompt || 'Sin palabra'}</Text>
          <Text style={styles.noticeText}>
            {isCurrentStellaScout
              ? hasCurrentUserFallen
                ? 'Has caido esta ronda. Espera al resto.'
                : 'Es tu turno. Revela una de tus cartas marcadas.'
              : `Turno de ${stellaCurrentScoutId ? getPlayerName(stellaCurrentScoutId) : 'otro jugador'}.`}
          </Text>
          {stellaInTheDarkPlayerId ? (
            <Text style={styles.noticeText}>En la sombra: {getPlayerName(stellaInTheDarkPlayerId)}</Text>
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
            <Text style={styles.noticeText}>Caidos: {stellaFallenPlayers.map((playerId) => getPlayerName(playerId)).join(', ')}</Text>
          ) : null}
        </View>
      );
    }

    if (currentPhase === 'SCORING') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Stella: puntuacion de ronda</Text>
          <Text style={styles.noticeText}>Palabra: {effectiveStellaPrompt || 'sin palabra'}</Text>
          {renderStellaScoreRows()}
          <Text style={styles.noticeText}>
            Esperando siguiente ronda...
          </Text>
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
                ? `Ha ganado ${getPlayerName(finalWinnerId)}.`
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

    // Si hay un minijuego activo, mostrar panel especifico y no la fase normal
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
                : `Duelo entre ${getPlayerName(activeConflictData.player1)} y ${getPlayerName(activeConflictData.player2)}`
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
            <Text style={styles.noticeText}>Selecciona una carta de tu mano y enviala con la pista.</Text>
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
          <Text style={styles.noticeText}>El storyteller actual es {storytellerId ? getPlayerName(storytellerId) : 'otro jugador'}.</Text>
        </View>
      );
    }

    if (currentPhase === 'SUBMISSION') {
      if (!isStoryteller) {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Envia tu carta</Text>
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
          <Text style={styles.sectionLabel}>Votacion en curso</Text>
          <Text style={styles.noticeText}>Espera a que el resto vote tu carta.</Text>
        </View>
      );
    }

    if (currentPhase === 'SCORING') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Puntuacion de la ronda</Text>
          <Text style={styles.noticeText}>Resumen de votos emitidos en la mesa.</Text>
          {renderVoteSummary()}
          <Text style={styles.noticeText}>Votos emitidos: {(currentRound?.votes ?? []).length}</Text>
          <Text style={styles.noticeText}>
            Esperando siguiente ronda...
          </Text>
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
                ? `Ha ganado ${getPlayerName(finalWinnerId)}.`
                : 'Ya hay un ganador. Puedes revisar la puntuacion final abajo.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Esperando fase</Text>
        <Text style={styles.noticeText}>El backend aun no ha enviado una fase jugable.</Text>
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
            <View style={styles.clueHeroHeader}>
              <View>
                <Text style={styles.clueHeroLabel}>{isStellaMode ? 'Palabra' : 'Pista'}</Text>
                <Text style={visibleRoundPrompt ? styles.clueHeroText : styles.clueHeroIdleText}>
                  {visibleRoundPrompt || (isStellaMode ? 'Esperando palabra' : 'Esperando pista')}
                </Text>
              </View>
              <View style={styles.viewToggle}>
                <TouchableOpacity
                  style={[styles.viewToggleButton, styles.viewToggleButtonActive]}
                  onPress={() => setBoardInspectorMode('board')}
                >
                  <Ionicons name="grid-outline" size={16} color="#10212e" />
                  <Text style={[styles.viewToggleButtonText, styles.viewToggleButtonTextActive]}>
                    Ver tablero
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
                    <Text style={styles.targetButtonText}>{player.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {renderPhasePanel()}

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

          {currentPhase === 'FINISHED' ? (
            <>
              <View style={styles.panel}>
                <Text style={styles.sectionLabel}>Resultados</Text>
                {finalRanking.length > 0 ? (
                  finalRanking.map((entry) => (
                    <View key={entry.playerId} style={[styles.resultRow, entry.playerId === currentUserId && styles.resultRowSelf]}>
                      <View>
                        <Text style={styles.resultName}>
                          {entry.place}. {getPlayerName(entry.playerId)}
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
                            {index + 1}. {player.name}
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
              {currentHandModifier ? (
                <View
                  style={[
                    styles.handModifierBanner,
                    currentHandModifier.value && currentHandModifier.value > 0
                      ? styles.handModifierBannerPositive
                      : styles.handModifierBannerNegative,
                  ]}
                >
                  <Image
                    source={
                      currentHandModifier.value && currentHandModifier.value > 0
                        ? HAND_LIMIT_PLUS_IMAGE
                        : HAND_LIMIT_MINUS_IMAGE
                    }
                    style={styles.handModifierBannerImage}
                    resizeMode="contain"
                  />
                  <View style={styles.handModifierBannerTextGroup}>
                    <Text style={styles.handModifierBannerTitle}>
                      {currentHandModifier.value && currentHandModifier.value > 0
                        ? `Bonus de mano: +${currentHandModifier.value}`
                        : `Limite de mano: ${currentHandModifier.value ?? 0}`}
                    </Text>
                    <Text style={styles.handModifierBannerText}>
                      {currentHandModifier.turnsLeft && currentHandModifier.turnsLeft > 0
                        ? `${currentHandModifier.turnsLeft} ronda${currentHandModifier.turnsLeft === 1 ? '' : 's'} restante${currentHandModifier.turnsLeft === 1 ? '' : 's'}`
                        : 'Modificador temporal activo'}
                    </Text>
                  </View>
                </View>
              ) : null}
              {handCards.length === 0 ? (
                <Text style={styles.emptyText}>Todavía no ha llegado tu mano privada.</Text>
              ) : (
                <View style={styles.cardGrid}>
                  {handCards.map((card, index) => {
                    const selected = selectedHandCardId === card.id;
                    return (
                      <TouchableOpacity
                        key={`${card.rawId}-${index}`}
                        style={[styles.handCard, selected && styles.handCardSelected]}
                        onPress={() => setSelectedHandCardId(card.id)}
                      >
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
                      <Text style={styles.playerName}>{player.name}</Text>
                      <Text style={styles.playerMeta}>Puntos: {player.score} · Casilla: {player.score}</Text>
                    </View>
                  </View>
                  {player.id === currentUserId ? <Text style={styles.selfBadge}>Tu</Text> : null}
                </View>
              ))
            )}
          </View>

          {false && pendingScore !== null && activeConflictData && isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Resolver duelo</Text>
              <Text style={styles.noticeText}>Tu minijuego terminÃƒÂ³ con {pendingScore} puntos. Elige el ganador final.</Text>
              <View style={styles.targetList}>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData?.player1 ?? '')}>
                  <Text style={styles.targetButtonText}>Gana {getPlayerName(activeConflictData?.player1 ?? '')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData?.player2 ?? '')}>
                  <Text style={styles.targetButtonText}>Gana {getPlayerName(activeConflictData?.player2 ?? '')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeConflictData && !isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Duelo en curso</Text>
              <Text style={styles.noticeText}>{getPlayerName(activeConflictData.player1)} y {getPlayerName(activeConflictData.player2)} están resolviendo un conflicto.</Text>
            </View>
          ) : null}
        </ScrollView>

        <Modal visible={boardInspectorMode === 'board'} transparent animationType="fade">
          <View style={styles.boardModalBackdrop}>
            <View style={styles.boardModalCard}>
              <View style={styles.boardModalHeader}>
                <View>
                  <Text style={styles.boardModalTitle}>Tablero</Text>
                </View>
                <TouchableOpacity
                  style={styles.boardModalCloseButton}
                  onPress={() => setBoardInspectorMode('clue')}
                >
                  <Ionicons name="close" size={20} color="#10212e" />
                </TouchableOpacity>
              </View>
              <View style={styles.boardModalCanvas}>{renderBoardInspector()}</View>
            </View>
          </View>
        </Modal>

        <DuelMinigameModal
          conflict={showConflictModal ? playableConflictData : null}
          currentUserId={currentUserId}
          onClose={() => setShowConflictModal(false)}
          onResolved={(score) => {
            const resolvedConflictKey = activeConflictKey;
            if (resolvedConflictKey && completedConflictKeyRef.current === resolvedConflictKey) {
              setShowConflictModal(false);
              return;
            }

            setPendingScore(score);
            if (resolvedConflictKey) {
              completedConflictKeyRef.current = resolvedConflictKey;
              setCompletedConflictKey(resolvedConflictKey);
              void AsyncStorage.setItem(COMPLETED_CONFLICT_STORAGE_KEY, resolvedConflictKey);
              void AsyncStorage.setItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY, String(score));
            }

            if (isParticipant) {
              submitMinigameScore(score, resolvedLobbyCode);
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
                <Ionicons name="star" size={28} color="#FCEEB5" />
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
                  <Text style={styles.gameChatAuthor}>{getPlayerName(message.username)}</Text>
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
    gap: 14,
  },
  clueHeroPanelIdle: {
    borderColor: 'rgba(252,238,181,0.28)',
  },
  clueHeroHeader: {
    width: '100%',
    gap: 14,
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
  viewToggle: {
    alignItems: 'center',
    marginTop: 6,
  },
  viewToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FCEEB5',
  },
  viewToggleButtonActive: {
    backgroundColor: '#FCEEB5',
    borderColor: '#FCEEB5',
  },
  viewToggleButtonText: {
    color: '#FCEEB5',
    fontWeight: '700',
    fontSize: 13,
  },
  viewToggleButtonTextActive: {
    color: '#10212e',
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
  voteSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  voteSummaryCard: {
    width: 96,
    height: 136,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.2)',
    position: 'relative',
  },
  voteSummaryImage: {
    width: '100%',
    height: '100%',
  },
  voteSummaryBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FCEEB5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  voteSummaryBadgeText: {
    color: '#10212e',
    fontWeight: 'bold',
  },
  voteSummaryOwner: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 19, 29, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  voteSummaryOwnerText: {
    color: '#FCEEB5',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
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
  handModifierBanner: {
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
  handModifierBannerPositive: {
    backgroundColor: 'rgba(56, 142, 60, 0.18)',
    borderColor: 'rgba(144, 238, 144, 0.45)',
  },
  handModifierBannerNegative: {
    backgroundColor: 'rgba(183, 28, 28, 0.18)',
    borderColor: 'rgba(255, 138, 128, 0.45)',
  },
  handModifierBannerImage: {
    width: 60,
    height: 60,
  },
  handModifierBannerTextGroup: {
    flex: 1,
    gap: 3,
  },
  handModifierBannerTitle: {
    color: '#FCEEB5',
    fontWeight: 'bold',
    fontSize: 15,
  },
  handModifierBannerText: {
    color: '#d7dce2',
    lineHeight: 18,
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
  boardModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  boardModalCard: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 19, 29, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.28)',
    padding: 10,
    gap: 14,
  },
  boardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  boardModalTitle: {
    color: '#FCEEB5',
    fontSize: 22,
    fontWeight: 'bold',
  },
  boardModalSubtitle: {
    color: '#d7dce2',
    marginTop: 4,
  },
  boardModalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FCEEB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardModalCanvas: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardCanvas: {
    width: '100%',
    aspectRatio: 0.58,
    position: 'relative',
    backgroundColor: 'rgba(18, 30, 48, 0.92)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  boardPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  boardGrid: { flex: 1, position: 'relative', zIndex: 2 },
  boardTile: {
    width: 32,
    height: 34,
    borderRadius: 8,
    position: 'absolute',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  boardTileInnerLayer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 6,
    margin: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  boardTileContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  boardTileShapeDiamond: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  boardTileInnerLayerDiamond: {
    borderRadius: 6,
  },
  boardTileContentCounterRotate: {
    transform: [{ rotate: '-45deg' }],
  },
  boardTileWide: { width: 36, height: 36 },
  boardTileFinish: {
    width: 44, height: 48,
    borderRadius: 14,
  },
  boardTileOverlay: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  boardTileIndex: {
    fontWeight: '900',
    fontSize: 10,
    marginBottom: 2,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  boardTileBadge: {
    minWidth: 18, height: 16,
    paddingHorizontal: 3,
    borderRadius: 999,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  boardTileBadgeText: {
    fontWeight: '900',
    fontSize: 8,
  },
  tileOccupants: { position: 'absolute', bottom: -8, flexDirection: 'row', gap: 2 },
  tileBadge: {
    height: 18,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: '#1a1f30',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  tileBadgeText: { color: '#ffffff', fontSize: 7, fontWeight: '900' },
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
