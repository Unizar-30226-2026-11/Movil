import {
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  Modal
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useFonts } from 'expo-font';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/api';
import { normalizeRemoteAssetUrl } from '@/constants/asset-url';
import {
  readDismissedActiveLobbyCodes,
} from '@/constants/dismissed-active-lobbies';
import { useGameSession } from '@/contexts/game-session-context';
import { SocialPanel } from '@/components/social-panel';

SplashScreen.preventAutoHideAsync();

type UserDeck = {
  id: string;
  name: string;
  cardIds: string[];
};

type OwnedCardOption = {
  cardId: string;
  name: string;
  quantity: number;
  url_image: string | null;
  collectionName: string;
  isOwned: boolean;
};

type FetchDecksOptions = {
  includeCatalog?: boolean;
  silent?: boolean;
};

type DeckCardTileProps = {
  card: OwnedCardOption;
  isSelected: boolean;
  onToggle: (cardId: string) => void;
};

const DeckCardTile = memo(function DeckCardTile({ card, isSelected, onToggle }: DeckCardTileProps) {
  const isLockedCard = !card.isOwned;

  return (
    <TouchableOpacity
      style={[
        styles.deckCardOption,
        isSelected && styles.deckCardOptionSelected,
        isLockedCard && styles.deckCardOptionLocked,
      ]}
      onPress={() => onToggle(card.cardId)}
      activeOpacity={isLockedCard ? 1 : 0.85}
      disabled={isLockedCard}
    >
      {card.url_image ? (
        <ExpoImage
          source={{ uri: card.url_image }}
          style={styles.deckCardImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={styles.deckCardPlaceholder}>
          <Text style={styles.deckCardPlaceholderText}>{card.cardId.replace('c_', '')}</Text>
        </View>
      )}
      {isLockedCard ? (
        <View style={styles.deckCardLockOverlay}>
          <Ionicons name="lock-closed" size={22} color="#FCEEB5" />
        </View>
      ) : null}
      {isSelected ? (
        <View style={styles.deckCardCheck}>
          <Ionicons name="checkmark" size={14} color="#10212e" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

const DEFAULT_DECK_NAME = 'Nuevo mazo';
const DECK_MIN_CARDS = 16;
const EASTER_EGG_TAPS = 20;
const LOBBY_PLAYER_OPTIONS = ['3', '4', '5', '6'];
const EASTER_EGG_MESSAGE =
  'Enhorabuena, has descubierto nuestro único easter egg. Dale las gracias a Sergio Guerra y Mohamed Rayen, desarrolladores del frontend movil de este juego.';

const normalizeCardId = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('c_') ? raw : `c_${raw.replace(/^c_/i, '')}`;
};

const normalizeDeckId = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('d_') ? raw : `d_${raw.replace(/^d_/i, '')}`;
};

const normalizeCollectionId = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('col_') ? raw : `col_${raw.replace(/^col_/i, '')}`;
};

const formatCollectionSegment = (value: string) => {
  const decoded = decodeURIComponent(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return decoded || 'Sin coleccion';
};

const inferCollectionNameFromUrl = (url: unknown) => {
  if (typeof url !== 'string' || !url.trim()) return '';

  const match = url.match(/\/cards\/([^/?#]+)/i);
  return match?.[1] ? formatCollectionSegment(match[1]) : '';
};

const isGenericSeedCollectionName = (value: unknown) =>
  /^Colecci(?:o|ó)n\s+\d+$/i.test(String(value ?? '').trim());

const inferCollectionNameFromCard = (card: any) => {
  const directCollection =
    card.collectionName ??
    card.collection_name ??
    card.collection?.name ??
    card.collection?.collectionName ??
    card.card?.collectionName;

  if (typeof directCollection === 'string' && directCollection.trim()) {
    return directCollection.trim();
  }

  const urlCollection = inferCollectionNameFromUrl(card.url_image ?? card.imageUrl ?? card.url);
  if (urlCollection) return urlCollection;

  const name = String(card.name ?? card.title ?? '');
  const [prefix] = name.split(' - ');
  return prefix && prefix !== name ? prefix.trim() : 'Sin coleccion';
};

const resolveCardCollectionName = (card: any, mappedCollectionName?: string) => {
  const inferredCollectionName = inferCollectionNameFromCard(card);
  if (!mappedCollectionName || isGenericSeedCollectionName(mappedCollectionName)) {
    return inferredCollectionName;
  }

  return mappedCollectionName;
};

const dedupeCardsById = (cards: OwnedCardOption[]) => {
  const uniqueCards = new Map<string, OwnedCardOption>();

  cards.forEach((card) => {
    if (!card.cardId || uniqueCards.has(card.cardId)) return;
    uniqueCards.set(card.cardId, {
      ...card,
      quantity: Math.max(0, Number(card.quantity ?? 0)),
      isOwned: Boolean(card.isOwned),
    });
  });

  return Array.from(uniqueCards.values());
};

const uniqueCardIds = (cardIds: string[]) => Array.from(new Set(cardIds.filter(Boolean)));

const normalizeLobbyMode = (value: unknown) => {
  const mode = String(value ?? 'Classic').toUpperCase();
  return mode.includes('STELLA') ? 'Stella' : 'Classic';
};

const getLobbyCode = (lobby: any) => String(lobby?.lobbyCode ?? lobby?.code ?? '');

const getPlayerId = (player: any) => {
  if (typeof player === 'string' || typeof player === 'number') return String(player);
  return String(
    player?.id ??
      player?.id_user ??
      player?.userId ??
      player?.user_id ??
      player?.playerId ??
      player?.user?.id ??
      player?.user?.id_user ??
      ''
  );
};

const getLobbyPlayerIds = (lobby: any) => {
  if (!Array.isArray(lobby?.players)) return [];
  return lobby.players.map(getPlayerId).filter(Boolean);
};

const isLobbyVisible = (lobby: any) => {
  const hostId = getPlayerId(lobby?.hostId ?? lobby?.host_id ?? lobby?.host);
  const players = getLobbyPlayerIds(lobby);
  if (players.length === 0) return true;
  return !hostId || players.includes(hostId);
};

const isUserInLobby = (lobby: any, userId: string) => {
  if (!userId) return true;
  const players = getLobbyPlayerIds(lobby);
  return players.includes(userId);
};

export default function MenuScreen() {
  const {
    activeGameId,
    closeActiveGame,
    dismissActiveGame,
    reconnectToActiveGame,
    refreshSession,
  } = useGameSession();
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [username, setUsername] = useState<string>('Cargando...');
  const [currentUserId, setCurrentUserId] = useState('');
  const [coins, setCoins] = useState<number>(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [createLobbyVisible, setCreateLobbyVisible] = useState(false);
  const [lobbyName, setLobbyName] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState('4');
  const [lobbyEngine, setLobbyEngine] = useState<'Classic' | 'Stella'>('Classic');
  const [isPrivateLobby, setIsPrivateLobby] = useState(false);
  const [lobbies, setLobbies] = useState<any[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [isLobbySearchVisible, setIsLobbySearchVisible] = useState(false);
  const [lobbySearchQuery, setLobbySearchQuery] = useState('');
  const [socialVisible, setSocialVisible] = useState(false);
  const [decks, setDecks] = useState<UserDeck[]>([]);
  const [ownedCards, setOwnedCards] = useState<OwnedCardOption[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);
  const [deckEditorVisible, setDeckEditorVisible] = useState(false);
  const [editingDeck, setEditingDeck] = useState<UserDeck | null>(null);
  const [editingDeckName, setEditingDeckName] = useState('');
  const [selectedDeckCardIds, setSelectedDeckCardIds] = useState<string[]>([]);
  const [selectedCollectionName, setSelectedCollectionName] = useState('Todas');
  const [isSavingDeck, setIsSavingDeck] = useState(false);
  const [activeSessionLobbyDetails, setActiveSessionLobbyDetails] = useState<any | null>(null);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
  const dismissActiveGameRef = useRef(dismissActiveGame);
  const easterEggTapCountRef = useRef(0);
  const deckCatalogLoadedRef = useRef(false);

  useEffect(() => {
    dismissActiveGameRef.current = dismissActiveGame;
  }, [dismissActiveGame]);

  const handleCoinPress = () => {
    easterEggTapCountRef.current += 1;

    if (easterEggTapCountRef.current >= EASTER_EGG_TAPS) {
      easterEggTapCountRef.current = 0;
      setEasterEggVisible(true);
    }
  };

  const closeEasterEgg = () => {
    setEasterEggVisible(false);
    easterEggTapCountRef.current = 0;
  };

  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        router.replace('/login');
        return;
      }

      const timestamp = new Date().getTime();

      const [responseProfile, responseBalance] = await Promise.all([
        fetch(`${API_URL}/users/profile?t=${timestamp}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        }),
        fetch(`${API_URL}/users/balance?t=${timestamp}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        }),
      ]);

      if (responseProfile.ok) {
        const dataProfile = await responseProfile.json();
        const profilePayload = dataProfile.profile ?? dataProfile.user ?? dataProfile;

        setCurrentUserId(String(profilePayload.id ?? profilePayload.id_user ?? profilePayload.userId ?? ''));
        
        if (dataProfile.profile && dataProfile.profile.username) {
          setUsername(dataProfile.profile.username);
        } else if (dataProfile.username) {
          setUsername(dataProfile.username);
        } else if (dataProfile.user && dataProfile.user.username) {
          setUsername(dataProfile.user.username);
        } else {
          setUsername('Jugador');
        }
      } else {
        setUsername('Jugador');
      }

      if (responseBalance.ok) {
        const dataBalance = await responseBalance.json();
        if (dataBalance.balance && typeof dataBalance.balance.balance === 'number') {
          setCoins(dataBalance.balance.balance);
        } else if (typeof dataBalance.balance === 'number') {
          setCoins(dataBalance.balance);
        } else if (typeof dataBalance.coins === 'number') {
          setCoins(dataBalance.coins);
        } else {
          setCoins(0);
        }
      }

    } catch (error) {
      console.log(error);
      setUsername("Error");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchLobbies = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      setIsLoadingLobbies(true);

      const timestamp = Date.now();
      const response = await fetch(`${API_URL}/lobbies?t=${timestamp}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

      const data = await response.json();

      console.log('LOBBIES:', JSON.stringify(data, null, 2));

      if (!response.ok) {
        setLobbies([]);
        return;
      }

      const rawLobbies = Array.isArray(data)
        ? data
        : Array.isArray(data.lobbies)
          ? data.lobbies
          : Array.isArray(data.lobbies?.lobbies)
            ? data.lobbies.lobbies
            : Array.isArray(data.data)
              ? data.data
              : [];

      const dismissedLobbyCodes = await readDismissedActiveLobbyCodes();
      setLobbies(
        rawLobbies.filter((lobby: any) =>
          isLobbyVisible(lobby) &&
          !dismissedLobbyCodes.includes(getLobbyCode(lobby).toUpperCase())
        )
      );
    } catch (error) {
      console.log('Error cargando lobbies:', error);
      setLobbies([]);
    } finally {
      setIsLoadingLobbies(false);
    }
  }, []);

  const extractCollections = (payload: any) => {
    if (Array.isArray(payload?.collections)) return payload.collections;
    if (Array.isArray(payload?.collections?.collections)) return payload.collections.collections;
    if (Array.isArray(payload)) return payload;
    return [];
  };

  const extractCollectionCards = (payload: any) => {
    if (Array.isArray(payload?.cards)) {
      if (payload.cards.every((item: any) => Array.isArray(item?.cards))) {
        return payload.cards.flatMap((item: any) => item.cards);
      }
      return payload.cards;
    }
    if (Array.isArray(payload?.cards?.cards)) return payload.cards.cards;
    if (Array.isArray(payload?.cards?.collections?.[0]?.cards)) return payload.cards.collections[0].cards;
    if (Array.isArray(payload?.collection?.cards)) return payload.collection.cards;
    if (Array.isArray(payload?.collections?.[0]?.cards)) return payload.collections[0].cards;
    if (Array.isArray(payload?.data?.cards)) return payload.data.cards;
    return [];
  };

  const fetchCollectionData = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/collections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          collectionMap: new Map<string, string>(),
          catalogCards: [] as OwnedCardOption[],
        };
      }

      const collections = extractCollections(data);
      const collectionCardsByCollection = await Promise.all(
        collections.map(async (collection: any) => {
          const collectionId = normalizeCollectionId(collection.id ?? collection.id_collection);
          if (!collectionId) {
            return {
              collectionName: String(collection.name ?? 'Sin coleccion'),
              cards: [] as any[],
            };
          }

          try {
            const cardsResponse = await fetch(`${API_URL}/collections/${collectionId}/cards`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const cardsData = await cardsResponse.json();
            if (!cardsResponse.ok) {
              return {
                collectionName: String(collection.name ?? 'Sin coleccion'),
                cards: [] as any[],
              };
            }

            const collectionName =
              cardsData?.collection?.name ??
              cardsData?.cards?.collection?.name ??
              collection.name ??
              'Sin coleccion';

            return {
              collectionName: String(collectionName),
              cards: extractCollectionCards(cardsData),
            };
          } catch {
            return {
              collectionName: String(collection.name ?? 'Sin coleccion'),
              cards: [] as any[],
            };
          }
        })
      );

      const collectionMap = new Map<string, string>();
      const catalogCards: OwnedCardOption[] = [];

      collectionCardsByCollection.forEach(({ collectionName, cards }) => {
        cards.forEach((card: any) => {
          const cardId = normalizeCardId(card.id ?? card.cardId ?? card.id_card);
          if (!cardId) return;

          collectionMap.set(cardId, String(collectionName));
          catalogCards.push({
            cardId,
            name: String(card.name ?? card.title ?? 'Carta sin nombre'),
            quantity: 0,
            url_image: normalizeRemoteAssetUrl(card.url_image),
            collectionName: resolveCardCollectionName(card, String(collectionName)),
            isOwned: false,
          });
        });
      });

      return {
        collectionMap,
        catalogCards: dedupeCardsById(catalogCards),
      };
    } catch {
      return {
        collectionMap: new Map<string, string>(),
        catalogCards: [] as OwnedCardOption[],
      };
    }
  }, []);

  const createLobby = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      if (!lobbyName.trim()) {
        Alert.alert('Error', 'El lobby debe tener nombre');
        return;
      }

      if (activeGameId) {
        const activeResponse = await fetch(`${API_URL}/lobbies/${activeGameId}?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
        });

        if (activeResponse.ok) {
          Alert.alert(
            'Partida activa',
            'Hay una sesion anterior enganchada. Puedes volver a ella o descartarla para crear una sala nueva.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Volver',
                onPress: () => void reconnectToActiveGame(),
              },
              {
                text: 'Descartar',
                style: 'destructive',
                onPress: () => void dismissActiveGame(activeGameId),
              },
            ],
          );
          return;
        }

        await dismissActiveGame(activeGameId);
      }

      setIsCreatingLobby(true);

      const response = await fetch(`${API_URL}/lobbies`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: lobbyName,
          maxPlayers: Number(lobbyPlayers),
          engine: lobbyEngine,
          isPrivate: isPrivateLobby
        })
      });

      const data = await response.json();

      console.log('CREATE LOBBY:', JSON.stringify(data, null, 2));

      if (!response.ok) {
        Alert.alert('Error', data.message || 'No se pudo crear el lobby');
        return;
      }

      setCreateLobbyVisible(false);
      setLobbyName('');
      setLobbyPlayers('4');
      setLobbyEngine('Classic');
      setIsPrivateLobby(false);

      const nuevaSala = data.lobby || data;

      router.push({
        pathname: '/main',
        params: {
          lobbyCode: String(nuevaSala.lobbyCode ?? nuevaSala.code ?? ''),
          autoJoin: '1',
        }
      });

    } catch (error) {
      console.log('Error creando lobby:', error);
      Alert.alert('Error', 'No se pudo crear el lobby');
    } finally {
      setIsCreatingLobby(false);
    }
  };

  const fetchLobbyByCode = useCallback(async (lobbyCode: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return null;

      const response = await fetch(`${API_URL}/lobbies/${lobbyCode}?t=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      const data = await response.json();
      if (!response.ok) return null;
      return data.lobby ?? data.room ?? data;
    } catch {
      return null;
    }
  }, []);

  const handleCloseActiveSession = async () => {
    if (!activeGameId) return;

    const localLobby = lobbies.find((item) => getLobbyCode(item) === activeGameId);
    const lobby = localLobby ?? (await fetchLobbyByCode(activeGameId));
    const hostId = String(lobby?.hostId ?? lobby?.host_id ?? '');
    const status = String(lobby?.status ?? '');
    const isHost = Boolean(currentUserId && hostId && hostId === currentUserId);

    if (isHost) {
      await closeActiveGame(activeGameId, status === 'waiting' ? 'lobby' : 'game');
    } else {
      await dismissActiveGame(activeGameId);
    }

    setLobbies((previous) => previous.filter((item) => getLobbyCode(item) !== activeGameId));
    setActiveSessionLobbyDetails(null);
    await refreshSession();
    await fetchLobbies();
  };

  const fetchDecks = useCallback(async (options?: FetchDecksOptions) => {
    const includeCatalog = options?.includeCatalog ?? false;
    const silent = options?.silent ?? false;

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return [];

      if (!silent) {
        setIsLoadingDecks(true);
      }

      const decksResponse = await fetch(`${API_URL}/users/decks`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const decksData = await decksResponse.json();
      let normalizedDecks: UserDeck[] = [];

      if (decksResponse.ok) {
        const rawDecks = Array.isArray(decksData?.decks)
          ? decksData.decks
          : Array.isArray(decksData)
            ? decksData
            : [];

        normalizedDecks = rawDecks.map((deck: any) => ({
          id: normalizeDeckId(deck.id ?? deck.deckId ?? deck.id_deck),
          name: String(deck.name ?? DEFAULT_DECK_NAME),
          cardIds: Array.isArray(deck.cardIds)
            ? uniqueCardIds(deck.cardIds.map(normalizeCardId))
            : [],
        }));
        setDecks(normalizedDecks);
      }

      if (!includeCatalog) {
        return normalizedDecks;
      }

      const cardsResponse = await fetch(`${API_URL}/users/cards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const cardsData = await cardsResponse.json();
      const rawCards = cardsResponse.ok
        ? Array.isArray(cardsData?.cards)
          ? cardsData.cards
          : Array.isArray(cardsData)
            ? cardsData
            : []
        : [];

      const collectionData = await fetchCollectionData(token);
      const ownedCardsMap = new Map<string, OwnedCardOption>();

      if (cardsResponse.ok) {
        const normalizedCards = rawCards.map((card: any) => {
          const cardId = normalizeCardId(card.cardId ?? card.id ?? card.id_card);

          return {
            cardId,
            name: String(card.name ?? card.title ?? 'Carta sin nombre'),
            quantity: 1,
            url_image: normalizeRemoteAssetUrl(card.url_image),
            collectionName: resolveCardCollectionName(card, collectionData.collectionMap.get(cardId)),
            isOwned: true,
          };
        }).filter((card: OwnedCardOption) => card.cardId);

        dedupeCardsById(normalizedCards).forEach((card) => {
          ownedCardsMap.set(card.cardId, card);
        });
      }

      const mergedCatalog = dedupeCardsById(
        collectionData.catalogCards.map((card) => ownedCardsMap.get(card.cardId) ?? card)
      );

      ownedCardsMap.forEach((card, cardId) => {
        if (!mergedCatalog.some((catalogCard) => catalogCard.cardId === cardId)) {
          mergedCatalog.push(card);
        }
      });

      setOwnedCards(
        mergedCatalog.sort((left, right) => {
          const collectionComparison = left.collectionName.localeCompare(right.collectionName, 'es', {
            sensitivity: 'base',
          });
          if (collectionComparison !== 0) return collectionComparison;

          return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
        })
      );
      deckCatalogLoadedRef.current = true;

      return normalizedDecks;
    } catch (deckError) {
      console.log('Error cargando mazos:', deckError);
      return [];
    } finally {
      if (!silent) {
        setIsLoadingDecks(false);
      }
    }
  }, [fetchCollectionData]);

  const openDeckEditor = async (deck?: UserDeck | null) => {
    const targetDeck = deck ?? null;
    setEditingDeck(targetDeck);
    setEditingDeckName(targetDeck?.name ?? DEFAULT_DECK_NAME);
    setSelectedDeckCardIds(uniqueCardIds(targetDeck?.cardIds ?? []));
    setSelectedCollectionName('Todas');
    setDeckEditorVisible(true);
    if (!deckCatalogLoadedRef.current) {
      void fetchDecks({ includeCatalog: true });
    }
  };

  const openNewDeckEditor = async () => {
    await openDeckEditor(null);
  };

  const toggleDeckCard = useCallback((cardId: string) => {
    const selectedCard = ownedCards.find((card) => card.cardId === cardId);
    if (!selectedCard?.isOwned) return;

    setSelectedDeckCardIds(previous =>
      previous.includes(cardId)
        ? previous.filter(selectedCardId => selectedCardId !== cardId)
        : [...previous, cardId]
    );
  }, [ownedCards]);

  const deleteDeck = async (deck: UserDeck) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token || !deck.id) return;

      const response = await fetch(`${API_URL}/users/decks/${deck.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Error', data.message || 'No se pudo eliminar el mazo');
        return;
      }

      await fetchDecks();
    } catch (deleteError) {
      console.log('Error eliminando mazo:', deleteError);
      Alert.alert('Error', 'No se pudo eliminar el mazo');
    }
  };

  const saveDeck = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const uniqueSelectedCardIds = uniqueCardIds(selectedDeckCardIds);
      const normalizedDeckName = editingDeckName.trim();

      if (!normalizedDeckName) {
        Alert.alert('Error', 'Ponle un nombre al mazo.');
        return;
      }

      if (uniqueSelectedCardIds.length < DECK_MIN_CARDS) {
        Alert.alert('Error', `Selecciona al menos ${DECK_MIN_CARDS} cartas`);
        return;
      }

      setIsSavingDeck(true);

      const endpoint = editingDeck
        ? `${API_URL}/users/decks/${editingDeck.id}`
        : `${API_URL}/users/decks`;
      const response = await fetch(endpoint, {
        method: editingDeck ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: normalizedDeckName,
          cardIds: uniqueSelectedCardIds,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Error', data.message || 'No se pudo guardar el mazo');
        return;
      }

      await fetchDecks();

      setDeckEditorVisible(false);
      setEditingDeck(null);
      setEditingDeckName('');
      setSelectedDeckCardIds([]);
    } catch (saveError) {
      console.log('Error guardando mazo:', saveError);
      Alert.alert('Error', 'No se pudo guardar el mazo');
    } finally {
      setIsSavingDeck(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
    fetchDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const preloadDeckCatalog = () => {
      if (deckCatalogLoadedRef.current) return;
      void fetchDecks({ includeCatalog: true, silent: true });
    };

    const timeout = setTimeout(preloadDeckCatalog, 350);
    return () => clearTimeout(timeout);
  }, [fetchDecks]);

  useFocusEffect(
    useCallback(() => {
      easterEggTapCountRef.current = 0;
      setEasterEggVisible(false);
      void fetchLobbies();
    }, [fetchLobbies])
  );

  useEffect(() => {
    if (!activeGameId) {
      setActiveSessionLobbyDetails(null);
      return;
    }

    let isCancelled = false;

    const validateActiveSession = async () => {
      const lobby = await fetchLobbyByCode(activeGameId);
      if (isCancelled) return;

      if (!lobby || !isLobbyVisible(lobby) || !isUserInLobby(lobby, currentUserId)) {
        await dismissActiveGameRef.current(activeGameId);
        if (!isCancelled) {
          setActiveSessionLobbyDetails(null);
          setLobbies((previous) => previous.filter((item) => getLobbyCode(item) !== activeGameId));
        }
        return;
      }

      setActiveSessionLobbyDetails(lobby);
    };

    void validateActiveSession();

    return () => {
      isCancelled = true;
    };
  }, [activeGameId, currentUserId, fetchLobbyByCode]);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  const collectionNames = useMemo(
    () => ['Todas', ...Array.from(new Set(ownedCards.map(card => card.collectionName)))],
    [ownedCards]
  );
  const visibleDeckCards = useMemo(
    () =>
      selectedCollectionName === 'Todas'
        ? ownedCards
        : ownedCards.filter(card => card.collectionName === selectedCollectionName),
    [ownedCards, selectedCollectionName]
  );
  const selectableDeckCards = useMemo(() => ownedCards.filter((card) => card.isOwned), [ownedCards]);
  const selectedDeckCardIdsSet = useMemo(() => new Set(selectedDeckCardIds), [selectedDeckCardIds]);
  const deckMaxCards = selectableDeckCards.length;
  const activeSessionLobby = useMemo(
    () =>
      activeGameId
        ? lobbies.find((lobby) => getLobbyCode(lobby) === activeGameId) ?? activeSessionLobbyDetails
        : null,
    [activeGameId, activeSessionLobbyDetails, lobbies]
  );
  const visibleLobbies = useMemo(() => {
    const query = lobbySearchQuery.trim().toLowerCase();
    if (!query) return lobbies;

    return lobbies.filter((lobby) => {
      const lobbyName = String(lobby.name ?? lobby.nombre ?? '').toLowerCase();
      return lobbyName.includes(query);
    });
  }, [lobbies, lobbySearchQuery]);
  const isActiveSessionHost = Boolean(
    activeSessionLobby &&
      currentUserId &&
      String(activeSessionLobby.hostId ?? activeSessionLobby.host_id ?? '') === currentUserId
  );
  const canSaveDeck =
    editingDeckName.trim().length > 0 &&
    selectedDeckCardIds.length >= DECK_MIN_CARDS &&
    selectedDeckCardIds.length <= Math.max(deckMaxCards, DECK_MIN_CARDS) &&
    !isSavingDeck;
  const renderDeckCard = useCallback(
    ({ item: card }: { item: OwnedCardOption }) => (
      <DeckCardTile
        card={card}
        isSelected={selectedDeckCardIdsSet.has(card.cardId)}
        onToggle={toggleDeckCard}
      />
    ),
    [selectedDeckCardIdsSet, toggleDeckCard]
  );

  if (!loaded && !error) return null;

  return (
    <ImageBackground
      source={require('../assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.headerTitleContainer} onPress={() => router.replace('/menu')}>
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText
                fill="black"
                stroke="#FCEEB5"
                strokeWidth="0.8"
                fontSize="28"
                fontFamily="FuenteTitulo"
                x="0"
                y="35"
              >
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </TouchableOpacity>

          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => router.push('/store')}>
              <Ionicons name="cart-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSocialVisible(true)}>
              <Ionicons name="people-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/profile')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bodyArea}>
          <View style={styles.userBanner}>
            {isLoadingProfile ? (
               <ActivityIndicator color="#FCEEB5" />
            ) : (
              <>
                <View style={styles.userInfoLeft}>
                  <Ionicons name="person" size={18} color="#FCEEB5" />
                  <Text style={styles.userBannerText}>Hola, {username}</Text>
                </View>
                <TouchableOpacity style={styles.userInfoRight} activeOpacity={1} onPress={handleCoinPress}>
                  <Text style={styles.userCoinsText}>{coins}</Text>
                  <Ionicons name="cash" size={20} color="#FFD700" />
                </TouchableOpacity>
              </>
            )}
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
          {activeGameId && activeSessionLobby ? (
            <View style={styles.activeSessionPanel}>
              <View style={styles.activeSessionTextGroup}>
                <Text style={styles.activeSessionTitle}>Sesion activa detectada</Text>
                <Text style={styles.activeSessionSubtitle}>
                  Codigo {activeGameId}. Puedes volver o {isActiveSessionHost ? 'cerrarla' : 'salir'} si ya no debe seguir activa.
                </Text>
              </View>
              <View style={styles.activeSessionActions}>
                <TouchableOpacity style={styles.resumeButton} onPress={() => void reconnectToActiveGame()}>
                  <Text style={styles.resumeButtonText}>Volver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeGameButton}
                  onPress={() =>
                    Alert.alert(
                      isActiveSessionHost ? 'Cerrar partida' : 'Salir de la partida',
                      isActiveSessionHost
                        ? 'Se cerrara la partida para todos los jugadores.'
                        : 'Saldras de esta partida y dejara de aparecerte.',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: isActiveSessionHost ? 'Cerrar' : 'Salir',
                          style: 'destructive',
                          onPress: () => void handleCloseActiveSession(),
                        },
                      ],
                    )
                  }
                >
                  <Text style={styles.closeGameButtonText}>{isActiveSessionHost ? 'Cerrar' : 'Salir'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.lobbiesHeader}>
            <View>
              <Text style={styles.lobbiesTitle}>Salas disponibles</Text>
              <Text style={styles.lobbiesSubtitle}>{visibleLobbies.length} resultados</Text>
            </View>
            <TouchableOpacity
              style={[styles.lobbySearchButton, isLobbySearchVisible && styles.lobbySearchButtonActive]}
              onPress={() => {
                setIsLobbySearchVisible((previous) => {
                  const nextValue = !previous;
                  if (!nextValue) {
                    setLobbySearchQuery('');
                  }
                  return nextValue;
                });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name={isLobbySearchVisible ? 'close-outline' : 'search-outline'} size={22} color="#FCEEB5" />
            </TouchableOpacity>
          </View>

          {isLobbySearchVisible ? (
            <View style={styles.lobbySearchPanel}>
              <Ionicons name="search-outline" size={18} color="#66727a" />
              <TextInput
                style={styles.lobbySearchInput}
                value={lobbySearchQuery}
                onChangeText={setLobbySearchQuery}
                placeholder="Buscar sala por nombre"
                placeholderTextColor="#66727a"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}

          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => router.push('/main')}
              activeOpacity={0.85}
            >
              <Ionicons name="keypad-outline" size={19} color="#FCEEB5" />
              <Text style={styles.quickActionText}>Codigo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, createLobbyVisible && styles.quickActionButtonActive]}
              onPress={() => {
                setCreateLobbyVisible((previous) => {
                  return !previous;
                });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name={createLobbyVisible ? 'close-outline' : 'add-circle-outline'} size={20} color="#FCEEB5" />
              <Text style={styles.quickActionText}>{createLobbyVisible ? 'Cerrar' : 'Crear'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, deckEditorVisible && styles.quickActionButtonActive]}
              onPress={() => void openNewDeckEditor()}
              activeOpacity={0.85}
            >
              <Ionicons name="albums-outline" size={19} color="#FCEEB5" />
              <Text style={styles.quickActionText}>Mazos</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.deckPanel}>
            <View style={styles.deckPanelHeader}>
              <View>
                <Text style={styles.deckPanelTitle}>Mazos</Text>
              </View>

              <TouchableOpacity style={styles.newDeckButton} onPress={() => void openNewDeckEditor()}>
                <Ionicons name="add-outline" size={16} color="#10212e" />
                <Text style={styles.newDeckButtonText}>Nuevo</Text>
              </TouchableOpacity>
            </View>

            {isLoadingDecks ? (
              <ActivityIndicator color="#10212e" />
            ) : decks.length === 0 ? (
              <View style={styles.emptyDecksBox}>
                <Ionicons name="albums-outline" size={26} color="#10212e" />
                <Text style={styles.emptyDecksTitle}>Todavia no tienes mazos</Text>
                <Text style={styles.emptyDecksText}>
                  Crea tu primer mazo para empezar a preparar partidas.
                </Text>
              </View>
            ) : (
              decks.map((deck) => {
                const isEditingDeck = deckEditorVisible && editingDeck?.id === deck.id;

                return (
                  <View
                    key={deck.id || deck.name}
                    style={[styles.deckRow, isEditingDeck && styles.deckRowSelected]}
                  >
                    <TouchableOpacity
                      style={styles.deckMainAction}
                      activeOpacity={0.85}
                      onPress={() => void openDeckEditor(deck)}
                    >
                      <View style={styles.deckTextGroup}>
                        <Text style={styles.deckName}>{deck.name || DEFAULT_DECK_NAME}</Text>
                        <Text style={styles.deckMeta}>{deck.cardIds.length} cartas</Text>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.deckRowActions}>
                      <TouchableOpacity
                        style={styles.deckIconButton}
                        onPress={() => void openDeckEditor(deck)}
                      >
                        <Ionicons name="create-outline" size={18} color="#FCEEB5" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deckIconButton}
                        onPress={() =>
                          Alert.alert(
                            'Eliminar mazo',
                            `Se eliminara "${deck.name}".`,
                            [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Eliminar',
                                style: 'destructive',
                                onPress: () => void deleteDeck(deck),
                              },
                            ],
                          )
                        }
                      >
                        <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {createLobbyVisible && (
            <View style={styles.createLobbyPanel}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nombre</Text>
                <TextInput
                  style={styles.lobbyInput}
                  value={lobbyName}
                  onChangeText={setLobbyName}
                  placeholder="Nombre del lobby"
                  placeholderTextColor="#6b6b6b"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Jugadores</Text>
                <View style={styles.playerOptionsRow}>
                  {LOBBY_PLAYER_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.playerOption,
                        lobbyPlayers === option && styles.playerOptionActive,
                      ]}
                      onPress={() => setLobbyPlayers(option)}
                    >
                      <Text
                        style={[
                          styles.playerOptionText,
                          lobbyPlayers === option && styles.playerOptionTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={styles.inputLabel}>Modo</Text>
              <View style={styles.engineOptionsRow}>
                <TouchableOpacity
                  style={[styles.engineOption, lobbyEngine === 'Classic' && styles.engineOptionActive]}
                  onPress={() => setLobbyEngine('Classic')}
                >
                  <Text style={[styles.engineOptionText, lobbyEngine === 'Classic' && styles.engineOptionTextActive]}>
                    Classic
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.engineOption, lobbyEngine === 'Stella' && styles.engineOptionActive]}
                  onPress={() => setLobbyEngine('Stella')}
                >
                  <Text style={[styles.engineOptionText, lobbyEngine === 'Stella' && styles.engineOptionTextActive]}>
                    Stella
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.privateRow}
                onPress={() => setIsPrivateLobby(!isPrivateLobby)}
              >
                <View style={[styles.checkbox, isPrivateLobby && styles.checkboxActive]}>
                  {isPrivateLobby && <Ionicons name="checkmark" size={14} color="#0f2027" />}
                </View>
                <Text style={styles.privateText}>Lobby privado</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.createAndJoinButton} onPress={createLobby} disabled={isCreatingLobby}>
                <Text style={styles.createAndJoinText}>
                  {isCreatingLobby ? 'Creando...' : 'Crear y entrar'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.lobbiesList}>
            {isLoadingLobbies ? (
              <ActivityIndicator color="#0f2027" />
            ) : visibleLobbies.length === 0 ? (
              <Text style={styles.emptyLobbiesText}>
                {lobbySearchQuery.trim() ? 'No hay salas con ese nombre' : 'No hay salas disponibles'}
              </Text>
            ) : (
              visibleLobbies.map((lobby, index) => {
                const modeName = normalizeLobbyMode(lobby.engine ?? lobby.modo);
                const isStellaLobby = modeName === 'Stella';
                const visiblePlayers = getLobbyPlayerIds(lobby);
                const shouldAutoJoin = !!currentUserId && visiblePlayers.includes(currentUserId);

                return (
                  <TouchableOpacity
                    key={String(lobby.id ?? lobby.lobbyCode ?? lobby.code ?? lobby.name ?? index)}
                    style={styles.lobbyCard}
                    activeOpacity={0.9}
                    onPress={() => {
                    const lobbyCode = String(lobby.lobbyCode ?? lobby.code ?? '');
                    const status = String(lobby.status ?? 'waiting');

                    if (status !== 'waiting') {
                      return;
                    }

                    return router.push({
                      pathname: '/main',
                      params: {
                        lobbyId: String(lobby.id ?? ''),
                        lobbyCode,
                        lobbyName: String(lobby.name ?? lobby.nombre ?? ''),
                        engine: String(lobby.engine ?? lobby.modo ?? 'STANDARD'),
                        maxPlayers: String(lobby.maxPlayers ?? 4),
                        currentPlayers: String(lobby.players?.length ?? lobby.currentPlayers ?? 0),
                        isPrivate: String(Boolean(lobby.isPrivate)),
                        status: String(lobby.status ?? 'waiting'),
                        autoJoin: shouldAutoJoin ? '1' : '0',
                      }
                    })
                  }}
                >
                  <View style={[styles.lobbyModeBanner, isStellaLobby ? styles.lobbyModeBannerStella : styles.lobbyModeBannerClassic]}>
                    {isStellaLobby ? (
                      <>
                        <Text style={[styles.lobbyBackdropMark, styles.stellaStarOne]}>✦</Text>
                        <Text style={[styles.lobbyBackdropMark, styles.stellaStarTwo]}>✧</Text>
                        <Text style={[styles.lobbyBackdropMark, styles.stellaStarThree]}>✦</Text>
                        <View style={styles.stellaHorizon} />
                      </>
                    ) : (
                      <>
                        <View style={styles.classicSun} />
                        <View style={[styles.classicDawnBand, styles.classicDawnBandTop]} />
                        <View style={[styles.classicDawnBand, styles.classicDawnBandBottom]} />
                      </>
                    )}
                    <Text style={styles.lobbyModeTitle}>{modeName}</Text>
                  </View>

                  <View style={styles.lobbyInfo}>
                    <Text style={styles.lobbyName}>
                      {lobby.name || lobby.nombre || 'Lobby sin nombre'}
                    </Text>

                    <Text style={styles.lobbyMeta}>
                      {modeName} · {(lobby.currentPlayers ?? lobby.players?.length ?? 1)}/{(lobby.maxPlayers ?? 4)} jugadores
                    </Text>

                    <Text style={styles.lobbyMeta}>
                      {lobby.status || 'Esperando jugadores'}
                    </Text>

                    <Text style={styles.lobbyMeta}>
                      {lobby.isPrivate ? 'Privada' : 'Pública'}
                    </Text>
                  </View>
                </TouchableOpacity>
                );
              })
            )}
          </View>

          <TouchableOpacity
            style={[styles.refreshLobbiesButton, isLoadingLobbies && styles.refreshLobbiesButtonDisabled]}
            onPress={() => void fetchLobbies()}
            disabled={isLoadingLobbies}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={18} color="#10212e" />
            <Text style={styles.refreshLobbiesButtonText}>
              {isLoadingLobbies ? 'Actualizando...' : 'Refrescar salas'}
            </Text>
          </TouchableOpacity>
          </ScrollView>

          <Modal
            visible={deckEditorVisible}
            transparent
            animationType="fade"
            statusBarTranslucent
            navigationBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={() => {
              setDeckEditorVisible(false);
              setEditingDeck(null);
              setEditingDeckName('');
              setSelectedDeckCardIds([]);
            }}
          >
            <View style={styles.deckModalOverlay}>
              <View style={styles.deckModalBox}>
                <View style={styles.deckModalHeader}>
                  <Text style={styles.deckModalTitle}>
                    {editingDeck ? 'Editar mazo' : 'Crear mazo'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setDeckEditorVisible(false);
                      setEditingDeck(null);
                      setEditingDeckName('');
                      setSelectedDeckCardIds([]);
                    }}
                  >
                    <Ionicons name="close-outline" size={26} color="#FCEEB5" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.deckNameInput}
                  value={editingDeckName}
                  onChangeText={setEditingDeckName}
                  placeholder="Nombre del mazo"
                  placeholderTextColor="#6b6b6b"
                  maxLength={40}
                />

                <Text style={styles.deckModalHelperText}>
                  Ponle un nombre al mazo y elige entre las cartas que tienes. Las bloqueadas se muestran con candado.
                </Text>

                <ScrollView
                  horizontal
                  style={styles.collectionTabsScroll}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collectionTabs}
                >
                  {collectionNames.map(collectionName => {
                    const isActiveCollection = selectedCollectionName === collectionName;

                    return (
                      <TouchableOpacity
                        key={collectionName}
                        style={[styles.collectionTab, isActiveCollection && styles.collectionTabActive]}
                        onPress={() => setSelectedCollectionName(collectionName)}
                      >
                        <Text style={[styles.collectionTabText, isActiveCollection && styles.collectionTabTextActive]}>
                          {collectionName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.deckCardCountText}>
                  {selectedDeckCardIds.length}/{deckMaxCards || 0} cartas seleccionadas
                </Text>

                {isLoadingDecks ? (
                  <View style={styles.deckLoadingBox}>
                    <ActivityIndicator color="#FCEEB5" />
                  </View>
                ) : ownedCards.length === 0 ? (
                  <Text style={styles.emptyDeckCardsText}>No hay cartas disponibles.</Text>
                ) : visibleDeckCards.length === 0 ? (
                  <Text style={styles.emptyDeckCardsText}>No hay cartas en esta coleccion</Text>
                ) : (
                  <FlatList
                    data={visibleDeckCards}
                    keyExtractor={(item) => item.cardId}
                    numColumns={3}
                    initialNumToRender={18}
                    windowSize={7}
                    removeClippedSubviews
                    contentContainerStyle={styles.deckCardsGrid}
                    showsVerticalScrollIndicator={false}
                    columnWrapperStyle={styles.deckCardsRow}
                    renderItem={renderDeckCard}
                  />
                )}

                <TouchableOpacity
                  style={[
                    styles.saveDeckButton,
                    canSaveDeck && styles.saveDeckButtonReady,
                    !canSaveDeck && styles.saveDeckButtonDisabled,
                  ]}
                  onPress={saveDeck}
                  disabled={!canSaveDeck}
                >
                  <Text style={styles.saveDeckButtonText}>{isSavingDeck ? 'Guardando...' : 'Guardar mazo'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={easterEggVisible} transparent animationType="fade" onRequestClose={closeEasterEgg}>
            <TouchableOpacity style={styles.easterEggOverlay} activeOpacity={1} onPress={closeEasterEgg}>
              <View style={styles.easterEggBox}>
                <Text style={styles.easterEggText}>{EASTER_EGG_MESSAGE}</Text>
              </View>
            </TouchableOpacity>
          </Modal>

          <SocialPanel visible={socialVisible} onClose={() => setSocialVisible(false)} />
        </View>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },

  header: {
    backgroundColor: 'rgba(10, 25, 40, 0.95)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCEEB5',
  },

  headerTitleContainer: { flex: 1, height: 50, marginRight: 10 },
  headerIcons: { flexDirection: 'row', gap: 15 },

  bodyArea: {
    flex: 1,
    position: 'relative',
  },

  userBanner: {
    backgroundColor: 'rgba(10, 25, 40, 0.8)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(252, 238, 181, 0.3)',
  },
  userInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  userBannerText: {
    color: '#FCEEB5',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userCoinsText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },

  contentContainer: {
    padding: 20,
    paddingBottom: 32,
  },

activeSessionPanel: {
  backgroundColor: 'rgba(10, 25, 40, 0.96)',
  borderRadius: 18,
  borderWidth: 1,
  borderColor: '#FCEEB5',
  padding: 14,
  marginBottom: 16,
  gap: 12,
},

activeSessionTextGroup: {
  gap: 4,
},

activeSessionTitle: {
  color: '#FCEEB5',
  fontSize: 17,
  fontWeight: 'bold',
},

activeSessionSubtitle: {
  color: '#d7dce2',
  fontSize: 13,
  lineHeight: 19,
},

activeSessionActions: {
  flexDirection: 'row',
  gap: 10,
},

resumeButton: {
  backgroundColor: '#A8C8C0',
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 14,
},

resumeButtonText: {
  color: '#10212e',
  fontWeight: 'bold',
},

closeGameButton: {
  backgroundColor: 'rgba(155, 48, 48, 0.86)',
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(252,238,181,0.3)',
},

closeGameButtonText: {
  color: '#ffffff',
  fontWeight: 'bold',
},

lobbiesHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 18,
},

headerActions: {
  gap: 10,
  alignItems: 'flex-end',
},

lobbySearchButton: {
  width: 44,
  height: 44,
  borderRadius: 14,
  backgroundColor: 'rgba(10, 25, 40, 0.95)',
  borderWidth: 1,
  borderColor: 'rgba(252, 238, 181, 0.26)',
  alignItems: 'center',
  justifyContent: 'center',
},

lobbySearchButtonActive: {
  backgroundColor: 'rgba(26, 53, 70, 0.98)',
  borderColor: '#FCEEB5',
},

lobbySearchPanel: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'rgba(238, 242, 245, 0.96)',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(16, 33, 46, 0.12)',
  paddingHorizontal: 12,
  paddingVertical: 10,
  marginTop: -8,
  marginBottom: 14,
},

lobbySearchInput: {
  flex: 1,
  color: '#10212e',
  fontSize: 15,
  paddingVertical: 2,
},

lobbiesTitle: {
  fontSize: 28,
  fontWeight: 'bold',
  color: '#0f2027',
},

lobbiesSubtitle: {
  fontSize: 14,
  color: '#2c3e50',
  marginTop: 4,
},

quickActionsRow: {
  flexDirection: 'row',
  gap: 8,
  marginBottom: 14,
},

quickActionButton: {
  flex: 1,
  minHeight: 44,
  borderRadius: 14,
  backgroundColor: 'rgba(10, 25, 40, 0.95)',
  borderWidth: 1,
  borderColor: 'rgba(252, 238, 181, 0.26)',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  paddingHorizontal: 6,
},

quickActionButtonActive: {
  backgroundColor: 'rgba(26, 53, 70, 0.98)',
  borderColor: '#FCEEB5',
},

quickActionText: {
  color: '#FCEEB5',
  fontWeight: 'bold',
  fontSize: 13,
},

deckPanel: {
  backgroundColor: 'rgba(238, 242, 245, 0.96)',
  borderRadius: 18,
  padding: 14,
  marginBottom: 16,
  gap: 12,
},

deckPanelHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
},

deckPanelTitle: {
  color: '#10212e',
  fontSize: 19,
  fontWeight: 'bold',
},

deckPanelSubtitle: {
  color: '#5c6870',
  fontSize: 13,
  marginTop: 2,
},

emptyDecksBox: {
  borderRadius: 16,
  backgroundColor: 'rgba(168, 200, 192, 0.3)',
  borderWidth: 1,
  borderColor: 'rgba(16, 33, 46, 0.12)',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingVertical: 18,
  paddingHorizontal: 14,
},

newDeckButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  backgroundColor: '#A8C8C0',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 9,
},

newDeckButtonText: {
  color: '#10212e',
  fontWeight: 'bold',
  fontSize: 13,
},

emptyDecksText: {
  color: '#46545f',
  textAlign: 'center',
  lineHeight: 20,
},

emptyDecksTitle: {
  color: '#10212e',
  fontWeight: 'bold',
  fontSize: 16,
},

deckRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'rgba(10, 25, 40, 0.92)',
  borderRadius: 14,
  padding: 10,
  borderWidth: 1,
  borderColor: 'rgba(10, 25, 40, 0.1)',
},

deckRowSelected: {
  borderColor: '#FCEEB5',
},

deckMainAction: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

deckRadio: {
  width: 22,
  height: 22,
  borderRadius: 11,
  borderWidth: 1,
  borderColor: '#FCEEB5',
  alignItems: 'center',
  justifyContent: 'center',
},

deckRadioSelected: {
  backgroundColor: '#FCEEB5',
},

deckTextGroup: {
  flex: 1,
},

deckName: {
  color: '#FCEEB5',
  fontWeight: 'bold',
  fontSize: 15,
},

deckMeta: {
  color: '#d7dce2',
  fontSize: 12,
  marginTop: 2,
},

deckRowActions: {
  flexDirection: 'row',
  gap: 8,
},

deckIconButton: {
  width: 34,
  height: 34,
  borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.08)',
  alignItems: 'center',
  justifyContent: 'center',
},

deckModalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.58)',
  justifyContent: 'center',
  padding: 18,
},

deckModalBox: {
  height: '86%',
  backgroundColor: 'rgba(10, 25, 40, 0.98)',
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(252, 238, 181, 0.35)',
  padding: 14,
  gap: 12,
},

deckModalHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},

deckModalTitle: {
  color: '#FCEEB5',
  fontSize: 21,
  fontWeight: 'bold',
},

deckNameInput: {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  paddingHorizontal: 13,
  paddingVertical: 11,
  color: '#10212e',
  fontSize: 15,
},

deckCardCountText: {
  color: '#d7dce2',
  fontSize: 13,
},

deckModalHelperText: {
  color: '#d7dce2',
  fontSize: 12,
  lineHeight: 18,
},

collectionTabs: {
  gap: 8,
  paddingRight: 8,
  alignItems: 'center',
  paddingVertical: 2,
},

collectionTabsScroll: {
  maxHeight: 48,
  minHeight: 48,
},

collectionTab: {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(252, 238, 181, 0.18)',
  paddingHorizontal: 13,
  minHeight: 40,
  justifyContent: 'center',
},

collectionTabActive: {
  backgroundColor: '#FCEEB5',
  borderColor: '#FCEEB5',
},

collectionTabText: {
  color: '#d7dce2',
  fontWeight: '700',
  fontSize: 13,
  lineHeight: 16,
},

collectionTabTextActive: {
  color: '#10212e',
},

deckCardsGrid: {
  paddingBottom: 8,
},

deckCardsRow: {
  justifyContent: 'space-between',
  marginBottom: 10,
},

emptyDeckCardsText: {
  color: '#d7dce2',
  textAlign: 'center',
  width: '100%',
  paddingVertical: 24,
},

deckLoadingBox: {
  width: '100%',
  minHeight: 180,
  alignItems: 'center',
  justifyContent: 'center',
},

deckCardOption: {
  width: '31%',
  minHeight: 130,
  borderRadius: 12,
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
  padding: 7,
  position: 'relative',
},

deckCardOptionSelected: {
  borderColor: '#FCEEB5',
  backgroundColor: 'rgba(252, 238, 181, 0.12)',
},

deckCardOptionLocked: {
  opacity: 0.9,
},

deckCardImage: {
  width: '100%',
  aspectRatio: 0.72,
  borderRadius: 9,
  backgroundColor: '#203544',
},

deckCardPlaceholder: {
  width: '100%',
  aspectRatio: 0.72,
  borderRadius: 9,
  backgroundColor: '#203544',
  alignItems: 'center',
  justifyContent: 'center',
},

deckCardPlaceholderText: {
  color: '#FCEEB5',
  fontSize: 20,
  fontWeight: 'bold',
},

deckCardName: {
  color: '#FCEEB5',
  fontSize: 11,
  fontWeight: '600',
  marginTop: 6,
  minHeight: 28,
},

deckCardLockOverlay: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(5, 12, 18, 0.58)',
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
},

deckCardCheck: {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: '#FCEEB5',
  alignItems: 'center',
  justifyContent: 'center',
},

saveDeckButton: {
  backgroundColor: 'rgba(212, 166, 58, 0.42)',
  borderRadius: 14,
  paddingVertical: 13,
  alignItems: 'center',
},

saveDeckButtonReady: {
  backgroundColor: '#f2c45b',
  shadowColor: '#f2c45b',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  elevation: 6,
},

saveDeckButtonDisabled: {
  opacity: 0.65,
},

saveDeckButtonText: {
  color: '#10212e',
  fontWeight: 'bold',
  fontSize: 16,
},

createLobbyButton: {
  backgroundColor: 'rgba(10, 25, 40, 0.95)',
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderRadius: 20,
},

secondaryLobbyButton: {
  backgroundColor: 'rgba(255,255,255,0.78)',
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(10, 25, 40, 0.2)',
},

secondaryLobbyButtonText: {
  color: '#0f2027',
  fontWeight: 'bold',
},

createLobbyButtonText: {
  color: '#FCEEB5',
  fontWeight: 'bold',
},

createLobbyPanel: {
  backgroundColor: 'rgba(238, 242, 245, 0.95)',
  borderRadius: 20,
  padding: 16,
  marginBottom: 20,
  gap: 12,
},

inputGroup: {
  gap: 6,
},

inputLabel: {
  fontSize: 13,
  fontWeight: '600',
  color: '#2c3e50',
},

lobbyInput: {
  width: '100%',
  backgroundColor: '#ffffff',
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#d4d4d4',
  fontSize: 15,
},

playerOptionsRow: {
  flexDirection: 'row',
  gap: 8,
},

playerOption: {
  flex: 1,
  borderRadius: 10,
  paddingVertical: 12,
  alignItems: 'center',
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: '#d4d4d4',
},

playerOptionActive: {
  backgroundColor: '#FCEEB5',
  borderColor: '#d4c494',
},

playerOptionText: {
  color: '#2c3e50',
  fontWeight: 'bold',
  fontSize: 15,
},

playerOptionTextActive: {
  color: '#10212e',
},

privateRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  marginTop: 4,
},

checkbox: {
  width: 20,
  height: 20,
  borderRadius: 4,
  borderWidth: 1,
  borderColor: '#2c3e50',
  backgroundColor: '#ffffff',
  justifyContent: 'center',
  alignItems: 'center',
},

checkboxActive: {
  backgroundColor: '#FCEEB5',
},

privateText: {
  color: '#2c3e50',
  fontSize: 14,
},

engineOptionsRow: {
  flexDirection: 'row',
  gap: 10,
},

engineOption: {
  flex: 1,
  borderRadius: 12,
  paddingVertical: 10,
  alignItems: 'center',
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: '#d4d4d4',
},

engineOptionActive: {
  backgroundColor: '#FCEEB5',
  borderColor: '#d4c494',
},

engineOptionText: {
  color: '#2c3e50',
  fontWeight: '600',
},

engineOptionTextActive: {
  fontWeight: 'bold',
},

createAndJoinButton: {
  width: '100%',
  backgroundColor: '#d4a63a',
  paddingHorizontal: 18,
  paddingVertical: 12,
  borderRadius: 18,
  marginTop: 4,
  alignItems: 'center',
},

createAndJoinText: {
  color: '#2c3e50',
  fontWeight: 'bold',
},

lobbiesList: {
  gap: 18,
  paddingBottom: 18,
},

refreshLobbiesButton: {
  alignSelf: 'center',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  backgroundColor: '#A8C8C0',
  borderRadius: 14,
  paddingHorizontal: 18,
  paddingVertical: 12,
  marginTop: 12,
  marginBottom: 22,
},

refreshLobbiesButtonDisabled: {
  opacity: 0.65,
},

refreshLobbiesButtonText: {
  color: '#10212e',
  fontWeight: 'bold',
  fontSize: 15,
},

lobbyCard: {
  borderRadius: 20,
  overflow: 'hidden',
  backgroundColor: 'rgba(10, 25, 40, 0.96)',
  elevation: 8,
},

lobbyModeBanner: {
  width: '100%',
  height: 150,
  alignItems: 'center',
  justifyContent: 'center',
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(252,238,181,0.18)',
  position: 'relative',
  overflow: 'hidden',
},

lobbyModeBannerClassic: {
  backgroundColor: '#e9b45b',
},

lobbyModeBannerStella: {
  backgroundColor: '#101833',
},

lobbyModeTitle: {
  color: '#FCEEB5',
  fontFamily: 'FuenteTitulo',
  fontSize: 42,
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 5,
  zIndex: 3,
},

lobbyBackdropMark: {
  position: 'absolute',
  color: 'rgba(252,238,181,0.9)',
  fontSize: 22,
  zIndex: 1,
},

stellaStarOne: {
  top: 18,
  left: 44,
},

stellaStarTwo: {
  top: 42,
  right: 54,
  fontSize: 18,
},

stellaStarThree: {
  bottom: 38,
  left: 118,
  fontSize: 15,
},

stellaHorizon: {
  position: 'absolute',
  left: -30,
  right: -30,
  bottom: -42,
  height: 92,
  backgroundColor: '#2b315d',
  transform: [{ rotate: '-3deg' }],
  opacity: 0.85,
},

classicSun: {
  position: 'absolute',
  width: 84,
  height: 84,
  borderRadius: 42,
  backgroundColor: '#FCEEB5',
  bottom: 22,
  right: 44,
  opacity: 0.9,
},

classicDawnBand: {
  position: 'absolute',
  left: -20,
  right: -20,
  height: 58,
  transform: [{ rotate: '-4deg' }],
},

classicDawnBandTop: {
  top: 0,
  backgroundColor: '#8bb9b0',
  opacity: 0.45,
},

classicDawnBandBottom: {
  bottom: -18,
  backgroundColor: '#d96f47',
  opacity: 0.35,
},

lobbyInfo: {
  padding: 14,
},

lobbyName: {
  color: '#FCEEB5',
  fontSize: 18,
  fontWeight: 'bold',
  marginBottom: 8,
},

lobbyMeta: {
  color: '#d7dce2',
  fontSize: 13,
  marginBottom: 3,
},

emptyLobbiesText: {
  fontSize: 16,
  color: '#2c3e50',
  textAlign: 'center',
  marginTop: 30,
},

easterEggOverlay: {
  flex: 1,
  backgroundColor: 'rgba(4, 12, 18, 0.72)',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 28,
},

easterEggBox: {
  backgroundColor: 'rgba(10, 25, 40, 0.96)',
  borderRadius: 18,
  borderWidth: 1,
  borderColor: '#FCEEB5',
  padding: 22,
},

easterEggText: {
  color: '#FCEEB5',
  fontSize: 17,
  lineHeight: 24,
  textAlign: 'center',
  fontWeight: '700',
},
});
