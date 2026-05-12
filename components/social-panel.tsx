import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { API_URL } from '@/constants/api';

type Friend = {
  id: string;
  username: string;
  status?: string;
  state?: string;
};

type FriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  username?: string;
  fromUsername?: string;
  fromUser?: {
    username?: string;
  };
  createdAt?: string;
};

type SearchResult = {
  id: string;
  username: string;
};

type SocialPanelProps = {
  visible: boolean;
  onClose: () => void;
};

const isOnlineStatus = (status?: string) => {
  const normalized = String(status ?? '').toUpperCase();
  return normalized === 'CONNECTED' || normalized === 'ONLINE' || normalized === 'IN_GAME';
};

const getFriendStatus = (friend: Friend) => friend.status ?? friend.state ?? 'UNKNOWN';

const getPresenceLabel = (status?: string) => {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'CONNECTED' || normalized === 'ONLINE') return 'Conectado';
  if (normalized === 'IN_GAME') return 'En partida';
  if (normalized === 'DISCONNECTED' || normalized === 'OFFLINE') return 'Desconectado';
  if (normalized === 'UNKNOWN') return 'Invisible';
  return 'Desconocido';
};

const getRequestSenderName = (request: FriendRequest) =>
  request.username ??
  request.fromUsername ??
  request.fromUser?.username ??
  request.fromUserId;

export function SocialPanel({ visible, onClose }: SocialPanelProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [showRequests, setShowRequests] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchJson = async (path: string, options?: RequestInit) => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) throw new Error('No hay sesion activa.');

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message ?? 'No se pudo completar la operacion.');
    }

    return data;
  };

  const fetchFriends = useCallback(async () => {
    const data = await fetchJson('/friends');
    setFriends(Array.isArray(data?.friends) ? data.friends : []);
  }, []);

  const fetchRequests = useCallback(async () => {
    const data = await fetchJson('/friends/requests');
    setRequests(Array.isArray(data?.pendingRequests) ? data.pendingRequests : []);
  }, []);

  const refreshSocial = useCallback(async () => {
    try {
      setIsLoading(true);
      await Promise.all([fetchFriends(), fetchRequests()]);
    } catch (error) {
      Alert.alert('Social', error instanceof Error ? error.message : 'No se pudo cargar social.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFriends, fetchRequests]);

  useEffect(() => {
    if (visible) {
      void refreshSocial();
    }
  }, [refreshSocial, visible]);

  const filteredFriends = useMemo(
    () =>
      friends.filter((friend) =>
        friend.username.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    [friends, searchQuery]
  );
  const onlineFriends = filteredFriends.filter((friend) => isOnlineStatus(getFriendStatus(friend)));
  const offlineFriends = filteredFriends.filter((friend) => !isOnlineStatus(getFriendStatus(friend)));

  const sendFriendRequest = async () => {
    const query = newFriendName.trim();
    if (!query || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const searchData = await fetchJson(`/users/search?q=${encodeURIComponent(query)}`);
      const results = Array.isArray(searchData?.results) ? (searchData.results as SearchResult[]) : [];
      const target = results.find((result) => result.username.toLowerCase() === query.toLowerCase()) ?? results[0];

      if (!target?.id) {
        Alert.alert('Social', 'Jugador no encontrado.');
        return;
      }

      const data = await fetchJson('/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: target.id }),
      });

      Alert.alert('Social', data?.message ?? `Solicitud enviada a ${target.username}.`);
      setAddFriendVisible(false);
      setNewFriendName('');
      await refreshSocial();
    } catch (error) {
      Alert.alert('Social', error instanceof Error ? error.message : 'No se pudo enviar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const data = await fetchJson(`/friends/requests/${requestId}`, {
        method: 'PUT',
        body: JSON.stringify({ action }),
      });
      Alert.alert('Social', data?.message ?? 'Solicitud procesada.');
      await refreshSocial();
    } catch (error) {
      Alert.alert('Social', error instanceof Error ? error.message : 'No se pudo procesar la solicitud.');
    }
  };

  const removeFriend = (friend: Friend) => {
    Alert.alert('Eliminar amigo', `Quieres eliminar a ${friend.username}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetchJson(`/friends/${friend.id}`, { method: 'DELETE' });
            setFriends((previous) => previous.filter((item) => item.id !== friend.id));
          } catch (error) {
            Alert.alert('Social', error instanceof Error ? error.message : 'No se pudo eliminar al amigo.');
          }
        },
      },
    ]);
  };

  if (!visible) return null;

  return (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
          <View style={styles.panel}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                <Ionicons name="arrow-back" size={24} color="#FCEEB5" />
              </TouchableOpacity>

              {isSearching ? (
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar amigo"
                  placeholderTextColor="#8caea6"
                />
              ) : (
                <Text style={styles.title}>Social</Text>
              )}

              <TouchableOpacity
                onPress={() => {
                  setIsSearching((previous) => !previous);
                  setSearchQuery('');
                }}
                style={styles.iconButton}
              >
                <Ionicons name={isSearching ? 'close' : 'search'} size={24} color="#FCEEB5" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.requestsButton} onPress={() => setShowRequests((previous) => !previous)}>
                <Text style={styles.requestsButtonText}>Peticiones ({requests.length})</Text>
                <Ionicons name={showRequests ? 'chevron-up' : 'chevron-down'} size={20} color="#2c3e50" />
              </TouchableOpacity>

              {showRequests
                ? requests.map((request) => (
                    <View key={request.id} style={styles.requestItem}>
                      <View style={styles.friendInfo}>
                        <Text style={styles.friendName}>{getRequestSenderName(request)}</Text>
                        <Text style={styles.friendActivity}>Solicitud recibida</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity onPress={() => void respondToRequest(request.id, 'accept')}>
                          <Ionicons name="checkmark-circle" size={28} color="#2ecc71" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => void respondToRequest(request.id, 'reject')}>
                          <Ionicons name="close-circle" size={28} color="#e74c3c" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                : null}

              {isLoading ? <Text style={styles.emptyText}>Cargando amigos...</Text> : null}

              {onlineFriends.length > 0 ? <Text style={styles.sectionTitle}>Conectados</Text> : null}
              {onlineFriends.map((friend) => (
                <View key={friend.id} style={styles.friendItem}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{friend.username.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{friend.username}</Text>
                    <Text style={styles.friendActivity}>{getPresenceLabel(getFriendStatus(friend))}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFriend(friend)}>
                    <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}

              {offlineFriends.length > 0 ? <Text style={styles.sectionTitle}>Desconectados</Text> : null}
              {offlineFriends.map((friend) => (
                <View key={friend.id} style={styles.friendItem}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{friend.username.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{friend.username}</Text>
                    <Text style={styles.friendActivity}>{getPresenceLabel(getFriendStatus(friend))}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFriend(friend)}>
                    <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}

              {!isLoading && filteredFriends.length === 0 ? (
                <Text style={styles.emptyText}>No hay amigos que mostrar.</Text>
              ) : null}
            </ScrollView>

            <TouchableOpacity style={styles.addFriendButton} onPress={() => setAddFriendVisible(true)}>
              <Text style={styles.addFriendButtonText}>Anadir amigo</Text>
            </TouchableOpacity>
          </View>

          {addFriendVisible ? (
            <View style={styles.inlineFormOverlay}>
              <View style={styles.formBox}>
                <Text style={styles.formTitle}>Nuevo amigo</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Nombre de usuario"
                  placeholderTextColor="#6b6b6b"
                  value={newFriendName}
                  onChangeText={setNewFriendName}
                  autoCapitalize="none"
                />
                <View style={styles.formButtons}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setAddFriendVisible(false)} disabled={isSubmitting}>
                    <Text style={styles.formButtonText}>Cerrar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={() => void sendFriendRequest()} disabled={isSubmitting}>
                    <Text style={styles.formButtonText}>{isSubmitting ? 'Enviando...' : 'Enviar'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
        </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.28)',
    zIndex: 50,
    elevation: 50,
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    width: '85%',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(10, 25, 40, 0.97)',
    borderLeftWidth: 1,
    borderLeftColor: '#FCEEB5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(252, 238, 181, 0.3)',
  },
  iconButton: {
    padding: 4,
  },
  title: {
    color: '#FCEEB5',
    fontSize: 20,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  searchInput: {
    flex: 1,
    color: '#FCEEB5',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#8caea6',
    marginHorizontal: 10,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  requestsButton: {
    backgroundColor: '#FCEEB5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  requestsButtonText: {
    color: '#2c3e50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#FCEEB5',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTitle: {
    color: '#8caea6',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#A8C8C0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#10212e',
    fontWeight: 'bold',
    fontSize: 18,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#FCEEB5',
    fontSize: 16,
    fontWeight: 'bold',
  },
  friendActivity: {
    color: '#8caea6',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: '#d7dce2',
    textAlign: 'center',
    paddingVertical: 18,
  },
  addFriendButton: {
    backgroundColor: '#A8C8C0',
    margin: 20,
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: 'center',
  },
  addFriendButtonText: {
    color: '#2c3e50',
    fontSize: 18,
    fontWeight: 'bold',
  },
  inlineFormOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  formBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#EEF2F5',
    padding: 24,
    borderRadius: 15,
  },
  formTitle: {
    color: '#2c3e50',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 18,
  },
  formInput: {
    width: '100%',
    backgroundColor: '#FCEEB5',
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 20,
    color: '#2c3e50',
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#A8C8C0',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  formButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
