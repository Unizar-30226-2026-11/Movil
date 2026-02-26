import {
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  Image
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function MenuScreen() {
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

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

            <TouchableOpacity>
              <Ionicons name="people-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity>
              <Ionicons name="person-circle-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
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

  modesContainer: {
    gap: 30,
  },

  modeCard: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
  },

  modeImage: {
    width: '100%',
    aspectRatio: 1.6,
  },

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