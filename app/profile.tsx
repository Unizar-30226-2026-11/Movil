import {
  StyleSheet, Text, View, ImageBackground, Image,
  TouchableOpacity, ScrollView, SafeAreaView, Alert, Modal, TextInput
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/api';

SplashScreen.preventAutoHideAsync();

type PresenceStatus = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN' | 'IN_GAME';

type OwnedCard = {
  cardId: string;
  name: string;
  quantity: number;
  rarity: string;
  url_image: string | null;
  collectionName: string;
};

type OwnedBoard = {
  id: string;
  name: string;
  description: string;
  url_image: string | null;
};

const PRESENCE_OPTIONS: { value: PresenceStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'CONNECTED', label: 'Conectado', icon: 'radio-button-on-outline' },
  { value: 'DISCONNECTED', label: 'Desconectado', icon: 'moon-outline' },
];

const getPresenceLabel = (status: string) =>
  PRESENCE_OPTIONS.find(option => option.value === status)?.label ?? 'Desconocido';

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

const dedupeCardsById = (cards: OwnedCard[]) => {
  const uniqueCards = new Map<string, OwnedCard>();

  cards.forEach((card) => {
    if (!card.cardId || uniqueCards.has(card.cardId)) return;
    uniqueCards.set(card.cardId, { ...card, quantity: 1 });
  });

  return Array.from(uniqueCards.values());
};

export default function ProfileScreen() {
  const router = useRouter();

  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [usuario, setUsuario] = useState({
    nombre: '',
    email: '',
    estado: 'UNKNOWN' as PresenceStatus,
    cartas: 0,
    tableros: 0,
  });
  const [modalCardsVisible, setModalCardsVisible] = useState(false);
  const [modalBoardsVisible, setModalBoardsVisible] = useState(false);
  const [modalUsernameVisible, setModalUsernameVisible] = useState(false);
  const [presenceDropdownVisible, setPresenceDropdownVisible] = useState(false);
  const [isUpdatingPresence, setIsUpdatingPresence] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);
  const [ownedBoards, setOwnedBoards] = useState<OwnedBoard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [selectedCollectionName, setSelectedCollectionName] = useState('Todas');
  const [usernameDraft, setUsernameDraft] = useState('');

  const inicialUsuario = usuario.nombre.trim().charAt(0).toUpperCase() || '?';

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

  const fetchProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/users/profile`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok && data.profile) {
        setUsuario(prev => ({
          ...prev,
          nombre: data.profile.username || '',
          email: data.profile.email || '',
          estado: (data.profile.state ?? 'UNKNOWN') as PresenceStatus,
          tableros: Array.isArray(data.profile.boards) ? data.profile.boards.length : prev.tableros,
        }));
      }
    } catch (profileError) {
      console.log('Error cargando perfil:', profileError);
    }
  };

  const fetchBoards = async () => {
    try {
      setIsLoadingBoards(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/users/boards`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) {
        const rawBoards = Array.isArray(data?.boards)
          ? data.boards
          : Array.isArray(data)
            ? data
            : [];

        const boards = rawBoards.map((board: any) => ({
          id: String(board.id ?? board.boardId ?? board.id_board),
          name: String(board.name ?? 'Tablero sin nombre'),
          description: String(board.description ?? ''),
          url_image: typeof board.url_image === 'string' && board.url_image.trim().length > 0 ? board.url_image : null,
        })).filter((board: OwnedBoard) => board.id);

        setOwnedBoards(boards);
        setUsuario(prev => ({ ...prev, tableros: boards.length }));
      }
    } catch (boardsError) {
      console.log('Error cargando tableros:', boardsError);
    } finally {
      setIsLoadingBoards(false);
    }
  };

  const extractCollections = (payload: any) => {
    if (Array.isArray(payload?.collections)) return payload.collections;
    if (Array.isArray(payload?.collections?.collections)) return payload.collections.collections;
    if (Array.isArray(payload)) return payload;
    return [];
  };

  const extractCollectionCards = (payload: any) => {
    if (Array.isArray(payload?.cards)) return payload.cards;
    if (Array.isArray(payload?.cards?.cards)) return payload.cards.cards;
    if (Array.isArray(payload?.cards?.collections?.[0]?.cards)) return payload.cards.collections[0].cards;
    if (Array.isArray(payload?.collection?.cards)) return payload.collection.cards;
    return [];
  };

  const fetchCollectionMap = async (token: string) => {
    const response = await fetch(`${API_URL}/collections`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) return new Map<string, string>();

    const collections = extractCollections(data);
    const collectionEntries = await Promise.all(
      collections.map(async (collection: any) => {
        const collectionId = collection.id ?? collection.id_collection;
        if (!collectionId) return [];

        try {
          const cardsResponse = await fetch(`${API_URL}/collections/${collectionId}/cards`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          const cardsData = await cardsResponse.json();
          if (!cardsResponse.ok) return [];

          const collectionName =
            cardsData?.collection?.name ??
            cardsData?.cards?.collection?.name ??
            collection.name ??
            'Coleccion desconocida';
          return extractCollectionCards(cardsData).map((card: any) => [
            String(card.id ?? card.cardId ?? card.id_card),
            String(collectionName),
          ]);
        } catch {
          return [];
        }
      })
    );

    return new Map<string, string>(collectionEntries.flat() as [string, string][]);
  };

  const fetchCards = async () => {
    try {
      setIsLoadingCards(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/users/cards`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok && data.cards) {
        const collectionMap = await fetchCollectionMap(token);
        const cards = data.cards.map((carta: any) => ({
          cardId: String(carta.cardId ?? carta.id ?? carta.id_card),
          name: String(carta.name ?? carta.title ?? 'Carta sin nombre'),
          quantity: 1,
          rarity: String(carta.rarity ?? 'COMMON'),
          url_image: typeof carta.url_image === 'string' && carta.url_image.trim().length > 0 ? carta.url_image : null,
          collectionName: resolveCardCollectionName(
            carta,
            collectionMap.get(String(carta.cardId ?? carta.id ?? carta.id_card)),
          ),
        }));
        const uniqueCards = dedupeCardsById(cards);

        setOwnedCards(uniqueCards);
        setUsuario(prev => ({ ...prev, cartas: uniqueCards.length }));
      }
    } catch (cardsError) {
      console.log('Error cargando cartas:', cardsError);
    } finally {
      setIsLoadingCards(false);
    }
  };

  const actualizarPresencia = async (status: PresenceStatus) => {
    try {
      setIsUpdatingPresence(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/users/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Error', data.message || 'No se pudo cambiar el estado.');
        return;
      }

      setUsuario(prev => ({ ...prev, estado: (data.status || status) as PresenceStatus }));
      setPresenceDropdownVisible(false);
    } catch {
      Alert.alert('Error', 'No se pudo cambiar el estado.');
    } finally {
      setIsUpdatingPresence(false);
    }
  };

  const cerrarSesion = async () => {
    await AsyncStorage.removeItem('userToken');

    if (router.canGoBack()) {
      router.dismissAll();
    }
    router.replace('/login');
  };

  const abrirCambioUsuario = () => {
    setUsernameDraft(usuario.nombre);
    setModalUsernameVisible(true);
  };

  const guardarNombreUsuario = async () => {
    const trimmedUsername = usernameDraft.trim();
    if (trimmedUsername.length < 3) {
      Alert.alert('Nombre no valido', 'El nombre debe tener al menos 3 caracteres.');
      return;
    }

    try {
      setIsUpdatingProfile(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/users/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: trimmedUsername }),
      });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Error', data.message || 'No se pudo cambiar el nombre.');
        return;
      }

      setUsuario(prev => ({ ...prev, nombre: data.user?.username ?? trimmedUsername }));
      setModalUsernameVisible(false);
    } catch {
      Alert.alert('Error', 'No se pudo cambiar el nombre.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const eliminarCuenta = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta accion borrara tu cuenta y tus datos. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingAccount(true);
              const token = await AsyncStorage.getItem('userToken');
              if (!token) return;

              const response = await fetch(`${API_URL}/users`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await response.json();

              if (!response.ok) {
                Alert.alert('Error', data.message || 'No se pudo eliminar la cuenta.');
                return;
              }

              await AsyncStorage.removeItem('userToken');
              router.dismissAll();
              router.replace('/login');
            } catch {
              Alert.alert('Error', 'No se pudo eliminar la cuenta.');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }

    fetchProfile();
    fetchCards();
    fetchBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const collectionNames = ['Todas', ...Array.from(new Set(ownedCards.map(card => card.collectionName)))];
  const visibleCards = selectedCollectionName === 'Todas'
    ? ownedCards
    : ownedCards.filter(card => card.collectionName === selectedCollectionName);

  return (
    <ImageBackground
      source={require('../assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 5 }}>
            <Ionicons name="arrow-back" size={28} color="#FCEEB5" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerTitleContainer} onPress={() => router.replace('/menu')}>
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="26" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </TouchableOpacity>

          <View style={styles.headerIcons}>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/store')}>
              <Ionicons name="cart-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.panel}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{inicialUsuario}</Text>
                </View>
              </View>

              <View style={styles.profileInfo}>
                <Text style={styles.username}>{usuario.nombre || 'Usuario'}</Text>
                <Text style={styles.userTitle}>{usuario.email}</Text>
                <View style={styles.statusPill}>
                  <Ionicons name="ellipse" size={10} color="#6c8b84" />
                  <Text style={styles.statusPillText}>{getPresenceLabel(usuario.estado)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.statBox} onPress={() => setModalCardsVisible(true)}>
              <Ionicons name="images-outline" size={24} color="#2c3e50" />
              <Text style={styles.statNumber}>{usuario.cartas}</Text>
              <Text style={styles.statLabel}>Cartas</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.statBox} onPress={() => setModalBoardsVisible(true)}>
              <Ionicons name="map-outline" size={24} color="#2c3e50" />
              <Text style={styles.statNumber}>{usuario.tableros}</Text>
              <Text style={styles.statLabel}>Tableros</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Ajustes de Cuenta</Text>

            <TouchableOpacity style={styles.menuItem} onPress={abrirCambioUsuario} disabled={isUpdatingProfile}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="create-outline" size={22} color="#2c3e50" />
                <Text style={styles.menuItemText}>Cambiar nombre de usuario</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#95a5a6" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setPresenceDropdownVisible(!presenceDropdownVisible)}
              disabled={isUpdatingPresence}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons name="radio-outline" size={22} color="#2c3e50" />
                <Text style={styles.menuItemText}>Estado social</Text>
              </View>
              <View style={styles.presenceValue}>
                <Text style={styles.presenceValueText}>{getPresenceLabel(usuario.estado)}</Text>
                <Ionicons name={presenceDropdownVisible ? 'chevron-up' : 'chevron-down'} size={20} color="#95a5a6" />
              </View>
            </TouchableOpacity>

            {presenceDropdownVisible ? (
              <View style={styles.presenceDropdown}>
                {PRESENCE_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.presenceOption,
                      usuario.estado === option.value && styles.presenceOptionActive,
                    ]}
                    onPress={() => actualizarPresencia(option.value)}
                    disabled={isUpdatingPresence}
                  >
                    <View style={styles.menuItemLeft}>
                      <Ionicons name={option.icon} size={20} color="#2c3e50" />
                      <Text style={styles.presenceOptionText}>{option.label}</Text>
                    </View>
                    {usuario.estado === option.value ? (
                      <Ionicons name="checkmark" size={20} color="#2c3e50" />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={eliminarCuenta} disabled={isDeletingAccount}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="trash-outline" size={22} color="#c0392b" />
                <Text style={[styles.menuItemText, styles.dangerText]}>
                  {isDeletingAccount ? 'Eliminando cuenta...' : 'Eliminar cuenta'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#d2a6a1" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={cerrarSesion}>
            <Ionicons name="log-out-outline" size={20} color="#c0392b" />
            <Text style={styles.logoutButtonText}>Cerrar Sesion</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal
          visible={modalCardsVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setModalCardsVisible(false)}
        >
          <View style={styles.cardsGalleryOverlay}>
            <View style={styles.cardsModalBox}>
              <View style={styles.cardsModalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Mis cartas</Text>
                  <Text style={styles.cardsModalSubtitle}>{usuario.cartas} cartas en total</Text>
                </View>
                <TouchableOpacity style={styles.closeIconButton} onPress={() => setModalCardsVisible(false)}>
                  <Ionicons name="close-outline" size={26} color="#FCEEB5" />
                </TouchableOpacity>
              </View>

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

              {isLoadingCards ? (
                <Text style={styles.emptyCardsText}>Cargando cartas...</Text>
              ) : ownedCards.length === 0 ? (
                <Text style={styles.emptyCardsText}>Todavia no tienes cartas.</Text>
              ) : visibleCards.length === 0 ? (
                <Text style={styles.emptyCardsText}>No hay cartas en esta coleccion.</Text>
              ) : (
                <ScrollView contentContainerStyle={styles.cardsGrid} showsVerticalScrollIndicator={false}>
                  {visibleCards.map((card, index) => (
                    <View key={`${card.cardId}-${index}`} style={styles.cardItem}>
                      <View style={styles.cardImageBox}>
                        {card.url_image ? (
                          <Image source={{ uri: card.url_image }} style={styles.cardImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.cardImagePlaceholder}>
                            <Ionicons name="image-outline" size={32} color="#FCEEB5" />
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={modalBoardsVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setModalBoardsVisible(false)}
        >
          <View style={styles.cardsGalleryOverlay}>
            <View style={styles.cardsModalBox}>
              <View style={styles.cardsModalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Mis tableros</Text>
                  <Text style={styles.cardsModalSubtitle}>{usuario.tableros} tableros en total</Text>
                </View>
                <TouchableOpacity style={styles.closeIconButton} onPress={() => setModalBoardsVisible(false)}>
                  <Ionicons name="close-outline" size={26} color="#FCEEB5" />
                </TouchableOpacity>
              </View>

              {isLoadingBoards ? (
                <Text style={styles.emptyCardsText}>Cargando tableros...</Text>
              ) : ownedBoards.length === 0 ? (
                <Text style={styles.emptyCardsText}>Todavia no tienes tableros.</Text>
              ) : (
                <ScrollView contentContainerStyle={styles.boardsGrid} showsVerticalScrollIndicator={false}>
                  {ownedBoards.map((board, index) => (
                    <View key={`${board.id}-${index}`} style={styles.boardItem}>
                      <View style={styles.boardImageBox}>
                        {board.url_image ? (
                          <Image source={{ uri: board.url_image }} style={styles.cardImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.cardImagePlaceholder}>
                            <Ionicons name="map-outline" size={34} color="#FCEEB5" />
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardName} numberOfLines={2}>{board.name}</Text>
                      {board.description ? (
                        <Text style={styles.cardMeta} numberOfLines={2}>{board.description}</Text>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={modalUsernameVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          presentationStyle="overFullScreen"
          onRequestClose={() => setModalUsernameVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.formBox}>
              <Text style={styles.formTitle}>Cambiar usuario</Text>
              <Text style={styles.inputLabel}>Nombre de usuario</Text>
              <TextInput
                style={styles.input}
                value={usernameDraft}
                onChangeText={setUsernameDraft}
                placeholder="nuevo_usuario"
                placeholderTextColor="#60717c"
                autoCapitalize="none"
                maxLength={20}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setModalUsernameVisible(false)}>
                  <Text style={styles.buttonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={guardarNombreUsuario} disabled={isUpdatingProfile}>
                  <Text style={styles.buttonText}>{isUpdatingProfile ? 'Guardando...' : 'Guardar'}</Text>
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
  background: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },

  header: {
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'rgba(10, 25, 40, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCEEB5',
  },
  headerTitleContainer: { flex: 1, height: 40, alignItems: 'center' },
  headerIcons: { flexDirection: 'row', gap: 5 },

  scrollContent: { padding: 20, gap: 20, paddingBottom: 50 },

  panel: {
    backgroundColor: 'rgba(238, 242, 245, 0.95)',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },

  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#A8C8C0',
    backgroundColor: '#dce8e3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 34, fontWeight: 'bold', color: '#2c3e50' },
  profileInfo: { flex: 1 },
  username: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  userTitle: { fontSize: 14, color: '#7f8c8d', marginBottom: 8 },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dce8e3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  statusPillText: { color: '#2c3e50', fontSize: 12, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(238, 242, 245, 0.95)',
    borderRadius: 15,
    padding: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginTop: 5 },
  statLabel: { fontSize: 12, color: '#7f8c8d', marginTop: 2 },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  menuItemText: { fontSize: 16, color: '#2c3e50' },
  dangerText: { color: '#c0392b', fontWeight: '700' },
  presenceValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  presenceValueText: { fontSize: 13, color: '#60717c', fontWeight: 'bold' },
  presenceDropdown: { gap: 8, marginTop: 10 },
  presenceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(44,62,80,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  presenceOptionActive: { backgroundColor: '#dce8e3', borderWidth: 1, borderColor: '#A8C8C0' },
  presenceOptionText: { fontSize: 15, color: '#2c3e50', fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 5 },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e5c9c5',
    paddingVertical: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d2a6a1',
    marginTop: 10,
  },
  logoutButtonText: { color: '#c0392b', fontSize: 16, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  cardsGalleryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    padding: 18,
  },
  formBox: {
    width: '85%',
    backgroundColor: '#EEF2F5',
    padding: 25,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  modalTitle: { fontSize: 21, fontWeight: 'bold', color: '#FCEEB5' },
  cardsModalBox: {
    height: '86%',
    backgroundColor: 'rgba(10, 25, 40, 0.98)',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(252, 238, 181, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
    gap: 12,
  },
  cardsModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardsModalSubtitle: { color: '#d7dce2', fontSize: 13, marginTop: 4 },
  closeIconButton: { padding: 4 },
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
  emptyCardsText: { color: '#d7dce2', textAlign: 'center', paddingVertical: 30 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 },
  boardsGrid: { gap: 12, paddingBottom: 8 },
  cardItem: {
    width: '31%',
    minHeight: 130,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardImageBox: { width: '100%', aspectRatio: 0.72, borderRadius: 10, overflow: 'hidden', backgroundColor: '#10212e', position: 'relative' },
  boardItem: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  boardImageBox: { width: '100%', aspectRatio: 1.8, borderRadius: 10, overflow: 'hidden', backgroundColor: '#10212e' },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardName: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 11, minHeight: 28, marginTop: 6 },
  cardMeta: { color: '#d7dce2', fontSize: 11 },
  cardRarity: { color: '#A8C8C0', fontSize: 10, fontWeight: 'bold' },

  inputLabel: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5, marginLeft: 5 },
  formTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 18, textAlign: 'center' },
  input: {
    width: '100%',
    backgroundColor: '#FCEEB5',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#d4c494',
    marginBottom: 20,
  },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelButton: { backgroundColor: '#FF6B6B', paddingVertical: 12, borderRadius: 10, width: '48%', alignItems: 'center' },
  saveButton: { backgroundColor: '#A8C8C0', paddingVertical: 12, borderRadius: 10, width: '48%', alignItems: 'center' },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
