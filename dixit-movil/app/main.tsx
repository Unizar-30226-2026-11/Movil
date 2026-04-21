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
import { useGameSession } from '@/contexts/game-session-context';

SplashScreen.preventAutoHideAsync();

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
    lobbyState,
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
        }
      } catch {}
    };

    bootstrap();
  }, [router]);

  const fetchLobbyDetails = async (code: string) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      setIsLoadingLobby(true);

      const response = await fetch(`${API_URL}/lobbies/${code.toUpperCase()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as LobbyResponse;

      if (!response.ok) {
        setLobbyData(null);
        return;
      }

      setLobbyData(data.lobby ?? null);
    } catch (fetchError) {
      console.log('Error cargando lobby:', fetchError);
      setLobbyData(null);
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

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    await fetchLobbyDetails(joinCode.trim());
    const joined = await requestLobbyTicket(joinCode.trim(), true);
    if (joined) {
      setJoinCode('');
    }
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
            <TouchableOpacity onPress={() => router.push('/profile')}>
              <Ionicons name="person-circle-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroPanel}>
            <Text style={styles.heroLabel}>Lobby realtime</Text>
            <Text style={styles.heroTitle}>{visibleLobby?.name ?? 'Sala de espera'}</Text>
            <Text style={styles.heroMeta}>
              Socket: {isSocketConnected ? 'conectado' : 'desconectado'} · Código: {visibleLobby?.lobbyCode ?? 'sin sala'}
            </Text>
          </View>

          <View style={styles.debugPanel}>
            <Text style={styles.debugTitle}>Debug lobby</Text>
            <Text style={styles.debugLine}>Usuario actual: {currentUserId || 'sin cargar'}</Text>
            <Text style={styles.debugLine}>Lobby params: {params.lobbyCode ?? 'ninguno'}</Text>
            <Text style={styles.debugLine}>Lobby socket: {currentLobbyCode ?? 'ninguno'}</Text>
            <Text style={styles.debugLine}>Socket: {isSocketConnected ? 'conectado' : 'desconectado'}</Text>
            <Text style={styles.debugLine}>LobbyState: {lobbyState ? 'recibido' : 'vacio'}</Text>
            <Text style={styles.debugLine}>Visible lobby: {visibleLobby?.lobbyCode ?? 'ninguno'}</Text>
            <Text style={styles.debugLine}>Players visibles: {players.length}</Text>
            <Text style={styles.debugLine}>Dentro de la sala: {isJoined ? 'si' : 'no'}</Text>
          </View>

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

                <View style={styles.playersList}>
                  {players.map((playerId, index) => (
                    <View key={`${playerId}-${index}`} style={styles.playerRow}>
                      <View style={styles.playerDot} />
                      <Text style={styles.playerText}>{playerId}</Text>
                      {playerId === visibleLobby.hostId ? <Text style={styles.hostBadge}>Host</Text> : null}
                    </View>
                  ))}
                </View>

                {!isJoined ? (
                  <TouchableOpacity style={[styles.primaryButton, isJoiningLobby && styles.primaryButtonDisabled]} onPress={handleJoinVisibleLobby} disabled={isJoiningLobby}>
                    <Text style={styles.primaryButtonText}>{isJoiningLobby ? 'Conectando...' : 'Unirme a la sala'}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.primaryButton} onPress={() => (isHost ? startLobbyGame() : Alert.alert('Sala', 'Esperando a que el host inicie la partida.'))}>
                    <Text style={styles.primaryButtonText}>{isHost ? 'Iniciar partida' : 'Ya estas dentro'}</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>Selecciona una sala desde el menú o introduce un código para entrar.</Text>
            )}
          </View>
        </ScrollView>
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
  debugPanel: {
    backgroundColor: 'rgba(12, 28, 40, 0.84)',
    borderRadius: 18,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.2)',
  },
  debugTitle: {
    color: '#FCEEB5',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugLine: {
    color: '#d7dce2',
    fontSize: 12,
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
  playersList: {
    gap: 8,
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
  emptyText: {
    color: '#2c3e50',
    lineHeight: 22,
  },
});
