import {
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/api';
import { useGameSession } from '@/contexts/game-session-context';

SplashScreen.preventAutoHideAsync();

export default function MenuScreen() {
  const { activeGameId } = useGameSession();
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [username, setUsername] = useState<string>('Cargando...');
  const [coins, setCoins] = useState<number>(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [createLobbyVisible, setCreateLobbyVisible] = useState(false);
  const [lobbyName, setLobbyName] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState('4');
  const [lobbyEngine, setLobbyEngine] = useState('Classic');
  const [isPrivateLobby, setIsPrivateLobby] = useState(false);
  const [lobbies, setLobbies] = useState<any[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);

  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        router.replace('/login');
        return;
      }

      const timestamp = new Date().getTime();

      const responseProfile = await fetch(`${API_URL}/users/profile?t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (responseProfile.ok) {
        const dataProfile = await responseProfile.json();
        
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

      const responseBalance = await fetch(`${API_URL}/users/balance?t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

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

  const fetchLobbies = async () => {
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

      if (Array.isArray(data)) {
        setLobbies(data);
      } else if (Array.isArray(data.lobbies)) {
        setLobbies(data.lobbies);
      } else if (Array.isArray(data.lobbies?.lobbies)) {
        setLobbies(data.lobbies.lobbies);
      } else if (Array.isArray(data.data)) {
        setLobbies(data.data);
      } else {
        setLobbies([]);
      }
    } catch (error) {
      console.log('Error cargando lobbies:', error);
      setLobbies([]);
    } finally {
      setIsLoadingLobbies(false);
    }
  };

  const createLobby = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      if (!lobbyName.trim()) {
        Alert.alert('Error', 'El lobby debe tener nombre');
        return;
      }

      if (activeGameId) {
        Alert.alert('Partida activa', 'Ya tienes una partida en curso. Vuelve a ella antes de crear otra.');
        router.push({
          pathname: '/gameScreen',
          params: { gameId: activeGameId },
        });
        return;
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

      fetchLobbies();

      const nuevaSala = data.lobby || data;

      router.push({
        pathname: '/main',
        params: {
          lobbyId: String(nuevaSala.id ?? nuevaSala._id ?? ''),
          lobbyCode: String(nuevaSala.lobbyCode ?? nuevaSala.code ?? ''),
          lobbyName: String(nuevaSala.name ?? lobbyName),
          engine: String(nuevaSala.engine ?? lobbyEngine),
          maxPlayers: String(nuevaSala.maxPlayers ?? lobbyPlayers),
          currentPlayers: '1', 
          isPrivate: String(Boolean(isPrivateLobby)),
          status: 'waiting',
          hostId: String(nuevaSala.hostId ?? ''),
          players: JSON.stringify(nuevaSala.players ?? []) 
        }
      });

    } catch (error) {
      console.log('Error creando lobby:', error);
      Alert.alert('Error', 'No se pudo crear el lobby');
    } finally {
      setIsCreatingLobby(false);
    }
  };

  useEffect(() => {
    fetchUserProfile();
    fetchLobbies();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

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

            <TouchableOpacity onPress={() => router.push('/profile')}>
              <Ionicons name="person-circle-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.userBanner}>
          {isLoadingProfile ? (
             <ActivityIndicator color="#FCEEB5" />
          ) : (
            <>
              <View style={styles.userInfoLeft}>
                <Ionicons name="person" size={18} color="#FCEEB5" />
                <Text style={styles.userBannerText}>Hola, {username}</Text>
              </View>
              <View style={styles.userInfoRight}>
                <Text style={styles.userCoinsText}>{coins}</Text>
                <Ionicons name="cash" size={20} color="#FFD700" />
              </View>
            </>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.lobbiesHeader}>
            <View>
              <Text style={styles.lobbiesTitle}>Salas disponibles</Text>
              <Text style={styles.lobbiesSubtitle}>{lobbies.length} resultados</Text>
            </View>

            <TouchableOpacity
              style={styles.createLobbyButton}
              onPress={() => setCreateLobbyVisible(!createLobbyVisible)}
            >
              <Text style={styles.createLobbyButtonText}>
                {createLobbyVisible ? 'Cerrar' : 'Crear lobby'}
              </Text>
            </TouchableOpacity>
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
                <TextInput
                  style={styles.lobbyInput}
                  value={lobbyPlayers}
                  onChangeText={setLobbyPlayers}
                  placeholder="4"
                  placeholderTextColor="#6b6b6b"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Modo</Text>
                <TextInput
                  style={styles.lobbyInput}
                  value={lobbyEngine}
                  onChangeText={setLobbyEngine}
                  placeholder="Classic"
                  placeholderTextColor="#6b6b6b"
                />
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

          <ScrollView
            contentContainerStyle={styles.lobbiesList}
            showsVerticalScrollIndicator={false}
          >
            {isLoadingLobbies ? (
              <ActivityIndicator color="#0f2027" />
            ) : lobbies.length === 0 ? (
              <Text style={styles.emptyLobbiesText}>No hay salas disponibles</Text>
            ) : (
              lobbies.map((lobby, index) => (
                <TouchableOpacity
                  key={String(lobby.id ?? lobby.code ?? lobby.name ?? index)}
                  style={styles.lobbyCard}
                  activeOpacity={0.9}
                  onPress={() =>
                    activeGameId
                      ? router.push({
                          pathname: '/gameScreen',
                          params: { gameId: activeGameId },
                        })
                      : router.push({
                          pathname: '/main',
                          params: {
                            lobbyId: String(lobby.id ?? ''),
                            lobbyCode: String(lobby.lobbyCode ?? lobby.code ?? ''),
                            lobbyName: String(lobby.name ?? lobby.nombre ?? ''),
                            engine: String(lobby.engine ?? lobby.modo ?? 'Classic'),
                            maxPlayers: String(lobby.maxPlayers ?? 4),
                            currentPlayers: String(lobby.players?.length ?? lobby.currentPlayers ?? 1),
                            isPrivate: String(Boolean(lobby.isPrivate)),
                            status: String(lobby.status ?? 'waiting')
                          }
                        })
                  }
                >
                  <View style={styles.lobbyImage} />

                  <View style={styles.lobbyInfo}>
                    <Text style={styles.lobbyName}>
                      {lobby.name || lobby.nombre || 'Lobby sin nombre'}
                    </Text>

                    <Text style={styles.lobbyMeta}>
                      {(lobby.engine || lobby.modo || 'Classic')} · {(lobby.currentPlayers ?? 1)}/{(lobby.maxPlayers ?? 4)} jugadores
                    </Text>

                    <Text style={styles.lobbyMeta}>
                      {lobby.status || 'Esperando jugadores'}
                    </Text>

                    <Text style={styles.lobbyMeta}>
                      {lobby.isPrivate ? 'Privada' : 'Pública'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
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
  padding: 20,
},

lobbiesHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 18,
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

createLobbyButton: {
  backgroundColor: 'rgba(10, 25, 40, 0.95)',
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderRadius: 20,
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

createAndJoinButton: {
  alignSelf: 'flex-end',
  backgroundColor: '#d4a63a',
  paddingHorizontal: 18,
  paddingVertical: 10,
  borderRadius: 18,
  marginTop: 4,
},

createAndJoinText: {
  color: '#2c3e50',
  fontWeight: 'bold',
},

lobbiesList: {
  gap: 18,
  paddingBottom: 40,
},

lobbyCard: {
  borderRadius: 20,
  overflow: 'hidden',
  backgroundColor: 'rgba(10, 25, 40, 0.96)',
  elevation: 8,
},

lobbyImage: {
  width: '100%',
  height: 150,
  backgroundColor: '#dfe6dc',
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
});
