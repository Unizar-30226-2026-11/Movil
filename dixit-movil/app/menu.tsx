import {
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

// ¡Pon tu IP aquí!
const API_URL = 'http://192.168.1.20:3000/api';

export default function MenuScreen() {
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

  // --- ESTADOS PARA LOS DATOS DEL USUARIO ---
  const [username, setUsername] = useState<string>('Cargando...');
  const [coins, setCoins] = useState<number>(0);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // --- FUNCIÓN PARA PEDIR DATOS AL BACKEND ---
  const fetchUserProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        router.replace('/login');
        return;
      }

      // 1. Pedimos el perfil
      const responseProfile = await fetch(`${API_URL}/users/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (responseProfile.ok) {
        const dataProfile = await responseProfile.json();
        // Según el Swagger, el nombre está en .profile.username
        if (dataProfile.profile && dataProfile.profile.username) {
          setUsername(dataProfile.profile.username);
        } else {
          setUsername('Jugador');
        }
      }

      // 2. Pedimos las monedas (balance)
      const responseBalance = await fetch(`${API_URL}/users/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (responseBalance.ok) {
        const dataBalance = await responseBalance.json();
        // Según el Swagger, las monedas están en .balance
        if (typeof dataBalance.balance === 'number') {
          setCoins(dataBalance.balance);
        } else {
          setCoins(0);
        }
      }

    } catch (error) {
      console.error("Error cargando perfil:", error);
      setUsername("Error");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    // Cuando la pantalla cargue, pedimos los datos
    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const seleccionarModo = (modo: string) => {
    router.push({
      pathname: '/main',
      params: { mode: modo }
    });
  };

  return (
    <ImageBackground
      source={require('../assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>

        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
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
          </View>

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

        {/* --- NUEVO PANEL DE USUARIO RECIÉN OBTENIDO DEL BACKEND --- */}
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
          <Text style={styles.title}>Selecciona un modo de juego</Text>

          <View style={styles.modesContainer}>
            <TouchableOpacity
              style={styles.modeCard}
              activeOpacity={0.9}
              onPress={() => seleccionarModo('classic')}
            >
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80' }}
                style={styles.modeImage}
              />
              <View style={styles.modeOverlay}>
                <Text style={styles.modeText}>Dixit Clásico</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeCard}
              activeOpacity={0.9}
              onPress={() => seleccionarModo('stella')}
            >
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&w=900&q=80' }}
                style={styles.modeImage}
              />
              <View style={styles.modeOverlay}>
                <Text style={styles.modeText}>Stella</Text>
              </View>
            </TouchableOpacity>
          </View>
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

  /* --- ESTILOS DEL NUEVO PANEL DE USUARIO --- */
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
  /* ------------------------------------------- */

  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FCEEB5',
    textAlign: 'center',
    marginBottom: 30,
  },
  modesContainer: { gap: 30 },
  modeCard: { borderRadius: 20, overflow: 'hidden', elevation: 8 },
  modeImage: { width: '100%', aspectRatio: 1.6 },
  modeOverlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 15,
    alignItems: 'center',
  },
  modeText: {
    color: '#FCEEB5',
    fontSize: 18,
    fontWeight: 'bold',
  },
});