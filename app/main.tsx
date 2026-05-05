import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFonts } from 'expo-font';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL } from '@/constants/api';
import { SocialPanel } from '@/components/social-panel';
import { useGameSession } from '@/contexts/game-session-context';

SplashScreen.preventAutoHideAsync();

const MIN_PLAYERS_TO_START = 2;

type LobbyResponse = {
  lobby?: {
    lobbyCode: string;
    hostId: string;
    name: string;
    maxPlayers: number;
    engine: 'STANDARD' | 'STELLA';
    isPrivate: boolean;
    status: 'waiting' | 'playing';
    players: string[];
  };
};

type OwnedBoard = {
  id: string;
  name: string;
  description?: string;
  url_image?: string;
};

export default function MainScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    lobbyCode?: string;
    lobbyName?: string;
    engine?: string;
    maxPlayers?: string;
    currentPlayers?: string;
    isPrivate?: string;
    status?: string;
    hostId?: string;
    players?: string;
    autoJoin?: string;
  }>();

  const {
    connectToLobbySession,
    currentLobbyCode,
    isSocketConnected,
    latestLobbyNotice,
    leaveLobbySession,
    lobbyChatMessages,
    lobbyState,
    sendLobbyChatMessage,
    startLobbyGame,
  } = useGameSession();

  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [currentUserId, setCurrentUserId] = useState('');
  const [lobbyData, setLobbyData] = useState<LobbyResponse['lobby'] | null>(null);
  const [isLoadingLobby, setIsLoadingLobby] = useState(false);
  const [isJoiningLobby, setIsJoiningLobby] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [socialVisible, setSocialVisible] = useState(false);
  const [ownedBoards, setOwnedBoards] = useState<OwnedBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [isUpdatingBoard, setIsUpdatingBoard] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          router.replace('/login');
          return;
        }

        const response = await fetch(`${API_URL}/users/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok && data.profile?.id) {
          setCurrentUserId(String(data.profile.id));
          setOwnedBoards(Array.isArray(data.profile.boards) ? data.profile.boards : []);
          const activeBoardId = data.profile.active_board_id;
          if (activeBoardId != null) {
            setSelectedBoardId(`b_${activeBoardId}`);
          } else if (Array.isArray(data.profile.boards) && data.profile.boards.length > 0) {
            setSelectedBoardId(String(data.profile.boards[0].id));
          }
        }
      } catch {}
    };

    bootstrap();
  }, [router]);

  const fetchLobbyDetails = async (code: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return null;

      setIsLoadingLobby(true);

      const response = await fetch(`${API_URL}/lobbies/${code.toUpperCase()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as LobbyResponse;

      if (!response.ok) {
        setLobbyData(null);
        return null;
      }

      const nextLobby = data.lobby ?? null;
      setLobbyData(nextLobby);
      return nextLobby;
    } catch (fetchError) {
      console.log('Error cargando lobby:', fetchError);
      setLobbyData(null);
      return null;
    } finally {
      setIsLoadingLobby(false);
    }
  };

  const requestLobbyTicket = useCallback(async (code: string, emitJoin = true) => {
    const normalizedCode = code.toUpperCase();

    if (currentLobbyCode === normalizedCode && isSocketConnected) {
      return true;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return false;

      setIsJoiningLobby(true);

      const response = await fetch(`${API_URL}/lobbies/${normalizedCode}/join`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (!response.ok || !data.wsToken) {
        Alert.alert('Error', data.message || 'No se pudo obtener el ticket del lobby.');
        return false;
      }

      connectToLobbySession(String(data.wsToken), String(data.lobbyCode ?? normalizedCode).toUpperCase(), {
        emitJoin,
      });
      return true;
    } catch (joinError) {
      console.log('Error preparando la conexión realtime:', joinError);
      Alert.alert('Error', 'No se pudo abrir la conexión realtime del lobby.');
      return false;
    } finally {
      setIsJoiningLobby(false);
    }
  }, [connectToLobbySession, currentLobbyCode, isSocketConnected]);

  useEffect(() => {
    if (params.lobbyCode) {
      fetchLobbyDetails(String(params.lobbyCode));
    }
  }, [params.lobbyCode]);

  useEffect(() => {
    if (params.autoJoin === '1' && params.lobbyCode) {
      void requestLobbyTicket(String(params.lobbyCode), true);
    }
  }, [params.autoJoin, params.lobbyCode, requestLobbyTicket]);

  const fallbackLobby = useMemo(() => {
    if (!params.lobbyCode) return null;

    return {
      lobbyCode: String(params.lobbyCode),
      hostId: String(params.hostId ?? ''),
      name: String(params.lobbyName ?? 'Sala'),
      maxPlayers: Number(params.maxPlayers ?? 4),
      engine: String(params.engine ?? 'STANDARD') as 'STANDARD' | 'STELLA',
      isPrivate: String(params.isPrivate ?? 'false') === 'true',
      status: String(params.status ?? 'waiting') as 'waiting' | 'playing',
      players: params.players ? JSON.parse(String(params.players)) : [],
    };
  }, [params.engine, params.hostId, params.isPrivate, params.lobbyCode, params.lobbyName, params.maxPlayers, params.players, params.status]);

  const visibleLobby =
    lobbyState && lobbyState.lobbyCode === (currentLobbyCode ?? params.lobbyCode)
      ? lobbyState
      : lobbyData ?? fallbackLobby;

  const players = visibleLobby?.players ?? [];
  const isHost = visibleLobby?.hostId === currentUserId;
  const isJoined = players.includes(currentUserId);

  const handleJoinVisibleLobby = async () => {
    if (!visibleLobby?.lobbyCode) return;
    await requestLobbyTicket(visibleLobby.lobbyCode, true);
  };

  const handleLeaveVisibleLobby = () => {
    if (!visibleLobby?.lobbyCode || !currentUserId || isHost) return;

    const lobbyCode = visibleLobby.lobbyCode;
    leaveLobbySession();
    setLobbyData((previous) => {
      const baseLobby = previous ?? visibleLobby;
      if (!baseLobby || baseLobby.lobbyCode !== lobbyCode) return previous;

      return {
        ...baseLobby,
        players: baseLobby.players.filter((playerId) => playerId !== currentUserId),
      };
    });

    setTimeout(() => {
      void fetchLobbyDetails(lobbyCode);
    }, 350);
  };

  const handleCloseVisibleLobby = () => {
    if (!visibleLobby?.lobbyCode || !isHost) return;

    const lobbyCode = visibleLobby.lobbyCode;
    Alert.alert(
      'Cerrar sala',
      `Se cerrara la sala ${lobbyCode}. Los jugadores tendran que crear o unirse a otra sala.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar',
          style: 'destructive',
          onPress: () => {
            leaveLobbySession();
            router.replace('/menu');
          },
        },
      ],
    );
  };

  const handleStartVisibleLobby = async () => {
    if (!visibleLobby?.lobbyCode || !isHost) return;

    let freshLobby = await fetchLobbyDetails(visibleLobby.lobbyCode);
    if (!freshLobby) {
      Alert.alert('Sala', 'No se pudo comprobar el estado actual de la sala.');
      return;
    }

    if (!freshLobby.players.includes(currentUserId)) {
      const joined = await requestLobbyTicket(freshLobby.lobbyCode, true);
      if (!joined) return;

      freshLobby = await fetchLobbyDetails(visibleLobby.lobbyCode);
      if (!freshLobby) {
        Alert.alert('Sala', 'No se pudo comprobar el estado actual de la sala.');
        return;
      }
    }

    if (freshLobby.players.length < MIN_PLAYERS_TO_START) {
      Alert.alert(
        'Faltan jugadores',
        `Se requieren al menos ${MIN_PLAYERS_TO_START} jugadores para iniciar. Ahora mismo hay ${freshLobby.players.length}.`,
      );
      return;
    }

    if (!isSocketConnected) {
      const connected = await requestLobbyTicket(freshLobby.lobbyCode, true);
      if (!connected) return;
      Alert.alert('Sala', 'Conectando con la sala. Pulsa iniciar de nuevo en un momento.');
      return;
    }

    startLobbyGame();
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    await fetchLobbyDetails(joinCode.trim());
    const joined = await requestLobbyTicket(joinCode.trim(), true);
    if (joined) {
      setJoinCode('');
    }
  };

  const handleSelectBoard = async (boardId: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      setIsUpdatingBoard(true);

      const response = await fetch(`${API_URL}/users/boards/active`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ boardId }),
      });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Tablero', data.message || 'No se pudo seleccionar el tablero.');
        return;
      }

      setSelectedBoardId(boardId);
      setBoardSelectorOpen(false);
    } catch {
      Alert.alert('Tablero', 'No se pudo seleccionar el tablero.');
    } finally {
      setIsUpdatingBoard(false);
    }
  };

  const handleSendChat = () => {
    if (!visibleLobby?.lobbyCode || !chatText.trim()) return;

    const sent = sendLobbyChatMessage(chatText, visibleLobby.lobbyCode);
    if (!sent) {
      Alert.alert('Chat', 'No se pudo enviar el mensaje porque el socket no esta conectado.');
      return;
    }

    setChatText('');
  };

  if (!loaded && !error) return null;

  return (
    <ImageBackground source={require('../assets/images/background.jpg')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerTitleContainer} onPress={() => router.replace('/menu')}>
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="28" fontFamily="FuenteTitulo" x="0" y="35">
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
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>{visibleLobby?.name ?? 'Sala de espera'}</Text>
            <Text style={styles.heroMeta}>
              Codigo: {visibleLobby?.lobbyCode ?? 'sin sala'}
            </Text>
          </View>

          {latestLobbyNotice ? (
            <View style={styles.noticeBanner}>
              <Ionicons
                name={latestLobbyNotice.kind === 'reshuffle' ? 'shuffle' : 'radio-outline'}
                size={18}
                color="#FCEEB5"
              />
              <Text style={styles.noticeBannerText}>{latestLobbyNotice.message}</Text>
            </View>
          ) : null}

          {!visibleLobby ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Unirse por código</Text>
              <View style={styles.joinRow}>
                <TextInput
                  style={styles.joinInput}
                  value={joinCode}
                  onChangeText={setJoinCode}
                  autoCapitalize="characters"
                  placeholder="Ej: QIXQ"
                  placeholderTextColor="#6b6b6b"
                />
                <TouchableOpacity style={styles.joinButton} onPress={handleJoinByCode} disabled={isJoiningLobby}>
                  <Text style={styles.joinButtonText}>{isJoiningLobby ? 'Conectando...' : 'Entrar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Estado de la sala</Text>

            {isLoadingLobby ? (
              <ActivityIndicator color="#FCEEB5" />
            ) : visibleLobby ? (
              <>
                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>CODIGO</Text>
                  <Text style={styles.codeValue}>{visibleLobby.lobbyCode}</Text>
                </View>

                <Text style={styles.infoText}>Modo: {visibleLobby.engine}</Text>
                <Text style={styles.infoText}>Estado: {visibleLobby.status}</Text>
                <Text style={styles.infoText}>Privacidad: {visibleLobby.isPrivate ? 'Privada' : 'Publica'}</Text>
                <Text style={styles.infoText}>
                  Jugadores: {players.length}/{visibleLobby.maxPlayers}
                </Text>

                {isJoined ? (
                  <View style={styles.chatBox}>
                    <TouchableOpacity
                      style={styles.chatHeader}
                      onPress={() => setChatOpen((previous) => !previous)}
                    >
                      <View style={styles.chatHeaderTitle}>
                        <Ionicons name="chatbubbles-outline" size={20} color="#2c3e50" />
                        <Text style={styles.chatTitle}>Chat del lobby</Text>
                      </View>
                      <View style={styles.chatHeaderMeta}>
                        <Text style={styles.chatCount}>{lobbyChatMessages.length}</Text>
                        <Ionicons
                          name={chatOpen ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#2c3e50"
                        />
                      </View>
                    </TouchableOpacity>

                    {chatOpen ? (
                      <View style={styles.chatContent}>
                        <ScrollView style={styles.chatMessages} nestedScrollEnabled>
                          {lobbyChatMessages.length === 0 ? (
                            <Text style={styles.chatEmpty}>Todavia no hay mensajes.</Text>
                          ) : (
                            lobbyChatMessages.map((message) => (
                              <View key={message.id} style={styles.chatMessage}>
                                <Text style={styles.chatMessageAuthor}>{message.username}</Text>
                                <Text style={styles.chatMessageText}>{message.text}</Text>
                              </View>
                            ))
                          )}
                        </ScrollView>

                        <View style={styles.chatInputRow}>
                          <TextInput
                            style={styles.chatInput}
                            value={chatText}
                            onChangeText={setChatText}
                            placeholder="Escribe un mensaje"
                            placeholderTextColor="#6b6b6b"
                            maxLength={255}
                          />
                          <TouchableOpacity
                            style={[
                              styles.chatSendButton,
                              (!chatText.trim() || !isSocketConnected) && styles.chatSendButtonDisabled,
                            ]}
                            onPress={handleSendChat}
                            disabled={!chatText.trim() || !isSocketConnected}
                          >
                            <Ionicons name="send" size={18} color="#FCEEB5" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.playersList}>
                  {players.map((playerId, index) => (
                    <View key={`${playerId}-${index}`} style={styles.playerRow}>
                      <View style={styles.playerDot} />
                      <Text style={styles.playerText}>{playerId}</Text>
                      {playerId === visibleLobby.hostId ? <Text style={styles.hostBadge}>Host</Text> : null}
                    </View>
                  ))}
                </View>

                {isHost && isJoined && visibleLobby.status === 'waiting' ? (
                  <View style={styles.boardSection}>
                    <Text style={styles.boardSectionTitle}>Tablero de la partida</Text>
                    {ownedBoards.find((board) => board.id === selectedBoardId)?.url_image ? (
                      <ImageBackground
                        source={{ uri: ownedBoards.find((board) => board.id === selectedBoardId)?.url_image }}
                        style={styles.boardPreviewCard}
                        imageStyle={styles.boardPreviewCardImage}
                        resizeMode="cover"
                      >
                        <View style={styles.boardPreviewOverlay}>
                          <Text style={styles.boardPreviewTitle}>
                            {ownedBoards.find((board) => board.id === selectedBoardId)?.name}
                          </Text>
                        </View>
                      </ImageBackground>
                    ) : null}
                    <TouchableOpacity
                      style={styles.boardSelectorButton}
                      onPress={() => setBoardSelectorOpen((previous) => !previous)}
                      disabled={isUpdatingBoard || ownedBoards.length === 0}
                    >
                      <Text style={styles.boardSelectorText}>
                        {ownedBoards.find((board) => board.id === selectedBoardId)?.name ?? 'Selecciona tablero'}
                      </Text>
                      <Ionicons
                        name={boardSelectorOpen ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#2c3e50"
                      />
                    </TouchableOpacity>

                    {boardSelectorOpen ? (
                      <View style={styles.boardDropdown}>
                        {ownedBoards.map((board) => (
                          <TouchableOpacity
                            key={board.id}
                            style={[
                              styles.boardOption,
                              selectedBoardId === board.id && styles.boardOptionActive,
                            ]}
                            onPress={() => void handleSelectBoard(board.id)}
                            disabled={isUpdatingBoard}
                          >
                            <View style={styles.boardOptionContent}>
                              <Text style={styles.boardOptionTitle}>{board.name}</Text>
                              {board.description ? (
                                <Text style={styles.boardOptionMeta} numberOfLines={2}>{board.description}</Text>
                              ) : null}
                            </View>
                            {selectedBoardId === board.id ? (
                              <Ionicons name="checkmark" size={20} color="#2c3e50" />
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {!isJoined ? (
                  <TouchableOpacity style={[styles.primaryButton, isJoiningLobby && styles.primaryButtonDisabled]} onPress={handleJoinVisibleLobby} disabled={isJoiningLobby}>
                    <Text style={styles.primaryButtonText}>{isJoiningLobby ? 'Conectando...' : 'Unirme a la sala'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.lobbyActions}>
                    {isHost ? (
                      <>
                        <TouchableOpacity style={styles.primaryButton} onPress={() => void handleStartVisibleLobby()}>
                          <Text style={styles.primaryButtonText}>Iniciar partida</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.closeLobbyButton} onPress={handleCloseVisibleLobby}>
                          <Text style={styles.closeLobbyButtonText}>Cerrar sala</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <View style={styles.joinedPill}>
                          <Text style={styles.joinedPillText}>Ya estas dentro</Text>
                        </View>
                        <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveVisibleLobby}>
                          <Text style={styles.leaveButtonText}>Salir de la sala</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>Selecciona una sala desde el menú o introduce un código para entrar.</Text>
            )}
            </View>
          </ScrollView>
          <SocialPanel visible={socialVisible} onClose={() => setSocialVisible(false)} />
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
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
  bodyArea: { flex: 1, position: 'relative' },
  scrollContent: { padding: 20, gap: 18, paddingBottom: 40 },
  heroPanel: {
    backgroundColor: 'rgba(10, 25, 40, 0.9)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.35)',
  },
  heroLabel: {
    color: '#8caea6',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  heroTitle: {
    color: '#FCEEB5',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 6,
  },
  heroMeta: {
    color: '#d7dce2',
    marginTop: 8,
  },
  panel: {
    backgroundColor: 'rgba(238, 242, 245, 0.95)',
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  noticeBanner: {
    backgroundColor: 'rgba(10, 25, 40, 0.92)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeBannerText: {
    flex: 1,
    color: '#FCEEB5',
    fontWeight: '600',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  joinRow: {
    flexDirection: 'row',
    gap: 10,
  },
  joinInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4d4d4',
    fontSize: 16,
  },
  joinButton: {
    backgroundColor: '#A8C8C0',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  joinButtonText: {
    color: '#2c3e50',
    fontWeight: 'bold',
  },
  codeBox: {
    backgroundColor: '#1a2a3a',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  codeLabel: {
    color: '#8caea6',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: 'bold',
  },
  codeValue: {
    color: '#FCEEB5',
    fontSize: 30,
    fontWeight: 'bold',
    letterSpacing: 5,
    marginTop: 6,
  },
  infoText: {
    color: '#2c3e50',
    fontSize: 15,
  },
  chatBox: {
    backgroundColor: '#dce8e3',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A8C8C0',
    overflow: 'hidden',
  },
  chatHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chatHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatTitle: {
    color: '#2c3e50',
    fontSize: 15,
    fontWeight: '700',
  },
  chatHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatCount: {
    minWidth: 22,
    textAlign: 'center',
    color: '#FCEEB5',
    backgroundColor: '#2c3e50',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatContent: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(44, 62, 80, 0.12)',
    padding: 10,
    gap: 10,
  },
  chatMessages: {
    maxHeight: 180,
  },
  chatEmpty: {
    color: '#60717c',
    textAlign: 'center',
    paddingVertical: 14,
  },
  chatMessage: {
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  chatMessageAuthor: {
    color: '#2c3e50',
    fontWeight: 'bold',
    marginBottom: 3,
  },
  chatMessageText: {
    color: '#2c3e50',
    lineHeight: 18,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(44, 62, 80, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2c3e50',
  },
  chatSendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2c3e50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: {
    opacity: 0.45,
  },
  playersList: {
    gap: 8,
  },
  boardSection: {
    gap: 10,
  },
  boardSectionTitle: {
    color: '#2c3e50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  boardPreviewCard: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#10212e',
  },
  boardPreviewCardImage: {
    borderRadius: 14,
  },
  boardPreviewOverlay: {
    backgroundColor: 'rgba(10, 25, 40, 0.62)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  boardPreviewTitle: {
    color: '#FCEEB5',
    fontSize: 15,
    fontWeight: 'bold',
  },
  boardSelectorButton: {
    backgroundColor: '#dce8e3',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A8C8C0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  boardSelectorText: {
    flex: 1,
    color: '#2c3e50',
    fontWeight: '600',
    fontSize: 15,
  },
  boardDropdown: {
    gap: 8,
  },
  boardOption: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  boardOptionActive: {
    backgroundColor: '#dce8e3',
    borderWidth: 1,
    borderColor: '#A8C8C0',
  },
  boardOptionContent: {
    flex: 1,
    gap: 4,
  },
  boardOptionTitle: {
    color: '#2c3e50',
    fontWeight: '700',
    fontSize: 15,
  },
  boardOptionMeta: {
    color: '#60717c',
    fontSize: 12,
    lineHeight: 16,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    padding: 10,
  },
  playerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2ecc71',
  },
  playerText: {
    flex: 1,
    color: '#2c3e50',
    fontWeight: '600',
  },
  hostBadge: {
    color: '#FCEEB5',
    backgroundColor: '#2c3e50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: 'bold',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#cfe7c6',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#2c3e50',
    fontWeight: 'bold',
    fontSize: 18,
  },
  lobbyActions: {
    gap: 10,
  },
  joinedPill: {
    backgroundColor: 'rgba(44, 62, 80, 0.08)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  joinedPillText: {
    color: '#2c3e50',
    fontWeight: 'bold',
    fontSize: 16,
  },
  leaveButton: {
    backgroundColor: '#f3d4cd',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d99a8e',
  },
  leaveButtonText: {
    color: '#70362f',
    fontWeight: 'bold',
    fontSize: 16,
  },
  closeLobbyButton: {
    backgroundColor: '#f3d4cd',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d99a8e',
  },
  closeLobbyButtonText: {
    color: '#70362f',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyText: {
    color: '#2c3e50',
    lineHeight: 22,
  },
});
