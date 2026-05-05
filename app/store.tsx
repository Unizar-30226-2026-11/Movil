import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { API_URL } from '@/constants/api';

SplashScreen.preventAutoHideAsync();

type RawShopItem = Record<string, any>;
type StoreItemType = 'card' | 'board' | 'collection' | 'pack' | 'unknown';

type NormalizedShopItem = {
  key: string;
  raw: RawShopItem;
  type: StoreItemType;
  purchaseItemId: string | null;
  name: string;
  description: string;
  price: number;
  imageUrl: string | null;
  isPurchased: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

type OwnershipSnapshot = {
  cardIds: Set<string>;
  boardIds: Set<string>;
  collectionIds: Set<string>;
};

const ITEM_TYPE_LABELS: Record<StoreItemType, string> = {
  card: 'Carta',
  board: 'Tablero',
  collection: 'Coleccion',
  pack: 'Pack diario',
  unknown: 'Oferta',
};

const normalizeAssetId = (value: unknown, prefix?: 'c' | 'b' | 'col') => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!prefix) return raw.toLowerCase();

  const lower = raw.toLowerCase();
  return lower.startsWith(`${prefix}_`) ? lower : `${prefix}_${lower.replace(/^(c_|b_|col_)/i, '')}`;
};

const extractCollectionCards = (payload: any): any[] => {
  if (Array.isArray(payload?.cards?.cards)) return payload.cards.cards;
  if (Array.isArray(payload?.cards?.collections)) {
    return payload.cards.collections.flatMap((item: any) => (Array.isArray(item?.cards) ? item.cards : item));
  }
  if (Array.isArray(payload?.cards)) {
    return payload.cards.flatMap((item: any) => (Array.isArray(item?.cards) ? item.cards : item));
  }
  if (Array.isArray(payload?.collection?.cards)) return payload.collection.cards;
  if (Array.isArray(payload)) return payload.flatMap((item: any) => (Array.isArray(item?.cards) ? item.cards : item));
  return [];
};

const extractBoards = (payload: any): any[] => {
  if (Array.isArray(payload?.boards)) return payload.boards;
  if (Array.isArray(payload?.profile?.boards)) return payload.profile.boards;
  if (Array.isArray(payload?.user?.boards)) return payload.user.boards;
  if (Array.isArray(payload)) return payload;
  return [];
};

function getNormalizedPrice(item: RawShopItem) {
  const candidates = [item.price, item.cost, item.totalCost, item.totalPrice];
  const numericPrice = candidates.find((value) => typeof value === 'number');
  return typeof numericPrice === 'number' ? numericPrice : 0;
}

function getCardId(item: RawShopItem) {
  const candidates = [item.id_card, item.cardId, item.id, item.card?.id, item.card?.id_card];
  return candidates.find((value) => value !== undefined && value !== null);
}

function getCollectionId(item: RawShopItem) {
  const candidates = [item.id_collection, item.collectionId, item.collection?.id, item.collection?.id_collection, item.id];
  return candidates.find((value) => value !== undefined && value !== null);
}

function getBoardName(item: RawShopItem) {
  const candidates = [item.boardName, item.board?.name, item.id, item.code, item.name];
  const resolved = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof resolved === 'string' ? resolved.trim() : null;
}

function getBoardId(item: RawShopItem) {
  const candidates = [item.id_board, item.boardId, item.board?.id, item.board?.id_board, item.id];
  return candidates.find((value) => value !== undefined && value !== null);
}

function inferItemType(item: RawShopItem): StoreItemType {
  const joined = [
    item.type,
    item.itemType,
    item.kind,
    item.category,
    item.offerType,
    item.id,
    item.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (joined.includes('pack') || joined.includes('daily')) {
    return 'pack';
  }

  if (joined.includes('collection') || joined.includes('coleccion')) {
    return 'collection';
  }

  if (joined.includes('board') || joined.includes('tablero') || item.boardName || item.board) {
    return 'board';
  }

  if (item.card || item.cardId || typeof item.rarity === 'string' || joined.includes('card') || joined.includes('carta')) {
    return 'card';
  }

  return 'unknown';
}

function buildPurchaseItemId(item: RawShopItem, type: StoreItemType) {
  if (typeof item.purchaseItemId === 'string' && item.purchaseItemId.trim()) {
    return item.purchaseItemId;
  }

  if (typeof item.itemId === 'string' && item.itemId.trim()) {
    return item.itemId;
  }

  if (
    typeof item.id === 'string' &&
    /^(c_|b_|col_|pack_daily|card_|board_|collection_)/i.test(item.id)
  ) {
    return item.id;
  }

  if (type === 'pack') {
    return typeof item.id_pack === 'string' && item.id_pack.trim() ? item.id_pack : 'pack_daily';
  }

  if (type === 'card') {
    const cardId = getCardId(item);
    if (typeof cardId === 'string' && cardId.trim()) {
      return cardId;
    }
    return cardId !== undefined && cardId !== null ? `c_${cardId}` : null;
  }

  if (type === 'collection') {
    const collectionId = getCollectionId(item);
    if (typeof collectionId === 'string' && collectionId.trim()) {
      return collectionId;
    }
    return collectionId !== undefined && collectionId !== null ? `col_${collectionId}` : null;
  }

  if (type === 'board') {
    const boardId = getBoardId(item);
    if (typeof boardId === 'string' && boardId.trim()) {
      return boardId;
    }
    if (typeof boardId === 'number') {
      return `b_${boardId}`;
    }

    const boardName = getBoardName(item);
    return boardName ? `b_${boardName.toUpperCase().replace(/\s+/g, '_')}` : null;
  }

  return null;
}

function getItemVisuals(type: StoreItemType) {
  switch (type) {
    case 'card':
      return { icon: 'albums-outline' as const, accent: '#d4a63a' };
    case 'board':
      return { icon: 'grid-outline' as const, accent: '#8fb9ff' };
    case 'collection':
      return { icon: 'library-outline' as const, accent: '#c78cf2' };
    case 'pack':
      return { icon: 'gift-outline' as const, accent: '#7dd7c6' };
    default:
      return { icon: 'pricetag-outline' as const, accent: '#FCEEB5' };
  }
}

function itemIsOwned(item: RawShopItem, type: StoreItemType, ownership: OwnershipSnapshot) {
  if (item.isPurchased === true || item.purchased === true || item.owned === true) return true;

  if (type === 'card') {
    const cardId = normalizeAssetId(getCardId(item), 'c');
    return !!cardId && ownership.cardIds.has(cardId);
  }

  if (type === 'board') {
    const boardId = normalizeAssetId(getBoardId(item), 'b');
    return !!boardId && ownership.boardIds.has(boardId);
  }

  if (type === 'collection') {
    const collectionId = normalizeAssetId(getCollectionId(item), 'col');
    if (collectionId && ownership.collectionIds.has(collectionId)) return true;

    const collectionCards = extractCollectionCards(item);
    const collectionCardIds = collectionCards
      .map((card) => normalizeAssetId(card.id ?? card.cardId ?? card.id_card, 'c'))
      .filter(Boolean);

    return collectionCardIds.length > 0 && collectionCardIds.every((cardId) => ownership.cardIds.has(cardId));
  }

  return false;
}

function normalizeShopItem(item: RawShopItem, index: number, ownership: OwnershipSnapshot): NormalizedShopItem {
  const type = inferItemType(item);
  const purchaseItemId = buildPurchaseItemId(item, type);
  const visuals = getItemVisuals(type);
  const name =
    item.name ||
    item.title ||
    item.card?.name ||
    item.collection?.name ||
    (type === 'pack' ? 'Pack diario' : `Oferta ${index + 1}`);
  const description =
    item.description ||
    item.summary ||
    item.card?.description ||
    item.collection?.description ||
    (type === 'pack'
      ? 'Incluye 5 cartas que aun no tengas con descuento.'
      : type === 'board'
        ? 'Tablero cosmetico para personalizar la partida.'
        : type === 'collection'
          ? 'Coleccion completa con precio reducido.'
          : 'Articulo disponible en tu tienda diaria.');
  const imageUrl =
    typeof item.url_image === 'string' && item.url_image.trim().length > 0
      ? item.url_image
      : typeof item.card?.url_image === 'string' && item.card.url_image.trim().length > 0
        ? item.card.url_image
        : typeof item.board?.url_image === 'string' && item.board.url_image.trim().length > 0
          ? item.board.url_image
          : null;

  return {
    key: purchaseItemId ?? `${type}-${item.id ?? index}`,
    raw: item,
    type,
    purchaseItemId,
    name,
    description,
    price: getNormalizedPrice(item),
    imageUrl,
    isPurchased: itemIsOwned(item, type, ownership),
    icon: visuals.icon,
    accent: visuals.accent,
  };
}

function flattenShopPayload(payload: unknown): RawShopItem[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const shop = payload as RawShopItem;
  const items: RawShopItem[] = [];

  if (Array.isArray(shop.singleCards)) {
    items.push(...shop.singleCards.map((item: RawShopItem) => ({ ...item, type: 'card' })));
  }

  if (shop.cardPackOffer) {
    items.push({ ...shop.cardPackOffer, type: 'pack' });
  }

  if (shop.collectionOffer) {
    items.push({ ...shop.collectionOffer, type: 'collection' });
  }

  if (shop.boardOffer) {
    items.push({ ...shop.boardOffer, type: 'board' });
  }

  return items;
}

export default function StoreScreen() {
  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });
  const [modalCompraVisible, setModalCompraVisible] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<NormalizedShopItem | null>(null);
  const [productos, setProductos] = useState<RawShopItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [isLoadingShop, setIsLoadingShop] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [ownership, setOwnership] = useState<OwnershipSnapshot>({
    cardIds: new Set(),
    boardIds: new Set(),
    collectionIds: new Set(),
  });

  const normalizedProducts = useMemo(
    () => productos.map((producto, index) => normalizeShopItem(producto, index, ownership)),
    [ownership, productos]
  );

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    fetchShopItems();
    fetchBalance();
    fetchOwnedItems();
  }, []);

  const fetchOwnedItems = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const [cardsResponse, boardsResponse] = await Promise.all([
        fetch(`${API_URL}/users/cards?t=${Date.now()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache',
          },
        }),
        fetch(`${API_URL}/users/boards?t=${Date.now()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache',
          },
        }),
      ]);

      const [cardsData, boardsData] = await Promise.all([
        cardsResponse.ok ? cardsResponse.json() : null,
        boardsResponse.ok ? boardsResponse.json() : null,
      ]);

      const cardIds = new Set(
        extractCollectionCards(cardsData)
          .map((card) => normalizeAssetId(card.cardId ?? card.id ?? card.id_card, 'c'))
          .filter(Boolean)
      );

      const boardIds = new Set(
        extractBoards(boardsData)
          .map((board) => normalizeAssetId(board.id ?? board.boardId ?? board.id_board, 'b'))
          .filter(Boolean)
      );

      setOwnership({
        cardIds,
        boardIds,
        collectionIds: new Set(),
      });
    } catch (ownedItemsError) {
      console.log('Error cargando inventario para tienda:', ownedItemsError);
    }
  };

  const fetchShopItems = async () => {
    try {
      setIsLoadingShop(true);
      const token = await AsyncStorage.getItem('userToken');
      const timestamp = Date.now();

      const response = await fetch(`${API_URL}/shop/items?t=${timestamp}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      const data = await response.json();

      if (Array.isArray(data?.items)) {
        setProductos(data.items);
        return;
      }

      if (data?.items && typeof data.items === 'object') {
        setProductos(flattenShopPayload(data.items));
        return;
      }

      if (Array.isArray(data?.shop)) {
        setProductos(data.shop);
        return;
      }

      if (data?.shop && typeof data.shop === 'object') {
        setProductos(flattenShopPayload(data.shop));
        return;
      }

      if (Array.isArray(data)) {
        setProductos(data);
        return;
      }

      setProductos([]);
    } catch (fetchError) {
      console.log('Error cargando tienda:', fetchError);
      setProductos([]);
    } finally {
      setIsLoadingShop(false);
    }
  };

  const fetchBalance = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const timestamp = Date.now();
      const response = await fetch(`${API_URL}/users/balance?t=${timestamp}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      const data = await response.json();

      if (data.balance && typeof data.balance.balance === 'number') {
        setCoins(data.balance.balance);
      } else if (typeof data.balance === 'number') {
        setCoins(data.balance);
      } else if (typeof data.coins === 'number') {
        setCoins(data.coins);
      } else {
        setCoins(0);
      }
    } catch (fetchError) {
      console.log('Error al refrescar las monedas:', fetchError);
    }
  };

  const abrirCompra = (producto: NormalizedShopItem) => {
    if (producto.isPurchased) {
      Alert.alert('Ya comprado', 'Este articulo ya esta en tu cuenta.');
      return;
    }

    if (!producto.purchaseItemId) {
      Alert.alert('Oferta no valida', 'Este articulo no tiene un identificador de compra compatible.');
      return;
    }

    setProductoSeleccionado(producto);
    setModalCompraVisible(true);
  };

  const comprarProducto = async () => {
    if (!productoSeleccionado) return;

    if (productoSeleccionado.price > coins) {
      Alert.alert('Saldo insuficiente', 'No tienes suficientes monedas para comprar este articulo.');
      setModalCompraVisible(false);
      return;
    }

    try {
      setIsPurchasing(true);
      const token = await AsyncStorage.getItem('userToken');

      const response = await fetch(`${API_URL}/shop/buy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemId: productoSeleccionado.purchaseItemId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const nextCoins = data?.updatedBalance?.coins ?? data?.updatedEconomy?.coins;
        if (typeof nextCoins === 'number') {
          setCoins(nextCoins);
        } else {
          await fetchBalance();
        }

        await fetchOwnedItems();
        await fetchShopItems();
        Alert.alert('Compra realizada', data?.message ?? `${productoSeleccionado.name} se ha anadido a tu cuenta.`);
      } else {
        const message = data?.message || 'No se pudo completar la compra.';
        Alert.alert('Error', message);

        if (
          typeof message === 'string' &&
          (message.includes('posees') ||
            message.includes('Oferta no encontrada') ||
            message.includes('Formato de articulo') ||
            message.includes('Carta no encontrada'))
        ) {
          await fetchOwnedItems();
          await fetchShopItems();
        }
      }
    } catch (purchaseError) {
      console.log('Fallo al procesar la compra', purchaseError);
      Alert.alert('Error', 'No se pudo completar la compra.');
    } finally {
      setIsPurchasing(false);
      setModalCompraVisible(false);
    }
  };

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
            <View style={styles.coinsContainer}>
              <Text style={styles.coinsText}>{coins}</Text>
              <Ionicons name="cash" size={18} color="#FFD700" />
            </View>

            <TouchableOpacity onPress={() => router.push('/profile')} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroPanel}>
            <Text style={styles.heroLabel}>Tienda diaria</Text>
            <Text style={styles.heroTitle}>Ofertas privadas del dia</Text>
          </View>

          {isLoadingShop ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color="#FCEEB5" />
              <Text style={styles.stateText}>Cargando ofertas...</Text>
            </View>
          ) : normalizedProducts.length === 0 ? (
            <View style={styles.statePanel}>
              <Text style={styles.stateText}>No hay ofertas disponibles en este momento.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {normalizedProducts.map((producto) => (
                <View key={producto.key} style={styles.cardContainer}>
                  <View style={[styles.cardMedia, { borderColor: producto.accent }]}>
                    {producto.imageUrl ? (
                      <Image source={{ uri: producto.imageUrl }} style={styles.cardImage} resizeMode="cover" />
                    ) : (
                      <>
                        <Ionicons name={producto.icon} size={42} color={producto.accent} />
                        <Text style={[styles.cardType, { color: producto.accent }]}>
                          {ITEM_TYPE_LABELS[producto.type]}
                        </Text>
                      </>
                    )}
                    {producto.imageUrl ? (
                      <View style={styles.imageTypeBadge}>
                        <Text style={[styles.imageTypeBadgeText, { color: producto.accent }]}>
                          {ITEM_TYPE_LABELS[producto.type]}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.deckName}>{producto.name}</Text>
                  <Text style={styles.deckDescription}>{producto.description}</Text>

                  <View style={styles.cardFooter}>
                    <View style={styles.priceContainer}>
                      <Ionicons name="cash" size={16} color="#FFD700" />
                      <Text style={styles.priceText}>{producto.price}</Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.buyButton,
                        (!producto.purchaseItemId || producto.isPurchased || isPurchasing) && styles.buyButtonDisabled,
                      ]}
                      disabled={!producto.purchaseItemId || producto.isPurchased || isPurchasing}
                      onPress={() => abrirCompra(producto)}
                    >
                      <Text style={styles.buyText}>
                        {producto.isPurchased
                          ? 'Comprado'
                          : producto.purchaseItemId
                            ? 'Comprar'
                            : 'No disponible'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <Modal visible={modalCompraVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.confirmBox}>
              <Text style={styles.confirmTitle}>Confirmar compra</Text>
              <Text style={styles.confirmText}>
                {productoSeleccionado?.name ?? 'Articulo'} por {productoSeleccionado?.price ?? 0}{' '}
                monedas.
              </Text>

              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.noButton}
                  onPress={() => setModalCompraVisible(false)}
                  disabled={isPurchasing}
                >
                  <Text style={styles.confirmButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.yesButton, isPurchasing && styles.buyButtonDisabled]}
                  onPress={comprarProducto}
                  disabled={isPurchasing}
                >
                  <Text style={styles.confirmButtonText}>
                    {isPurchasing ? 'Comprando...' : 'Comprar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  header: {
    backgroundColor: 'rgba(10, 25, 40, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCEEB5',
  },
  headerTitleContainer: {
    flex: 1,
    height: 50,
    marginRight: 10,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    padding: 5,
  },
  coinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#FFD700',
    marginRight: 6,
  },
  coinsText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 20,
    gap: 18,
    paddingBottom: 44,
  },
  heroPanel: {
    backgroundColor: 'rgba(8, 19, 29, 0.96)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FCEEB5',
  },
  heroLabel: {
    color: '#8caea6',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FCEEB5',
    fontSize: 26,
    fontWeight: 'bold',
  },
  statePanel: {
    backgroundColor: 'rgba(10, 25, 40, 0.9)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    color: '#d7dce2',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  cardContainer: {
    width: '47%',
    backgroundColor: 'rgba(238, 242, 245, 0.94)',
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  cardMedia: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#10212e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imageTypeBadge: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(16, 33, 46, 0.88)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  imageTypeBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  cardType: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deckName: {
    fontWeight: '700',
    fontSize: 16,
    color: '#10212e',
  },
  deckDescription: {
    fontSize: 12,
    color: '#40515f',
    lineHeight: 18,
    minHeight: 54,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#10212e',
  },
  buyButton: {
    backgroundColor: '#A8C8C0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  buyButtonDisabled: {
    opacity: 0.55,
  },
  buyText: {
    fontWeight: '700',
    color: '#10212e',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#EEF2F5',
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10212e',
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#2c3e50',
  },
  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  noButton: {
    flex: 1,
    backgroundColor: '#d6a3a3',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  yesButton: {
    flex: 1,
    backgroundColor: '#6c8b84',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
