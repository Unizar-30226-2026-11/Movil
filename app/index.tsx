import { ImageBackground, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import Svg, { Text as SvgText } from 'react-native-svg';

SplashScreen.preventAutoHideAsync();

export default function HomeScreen() {
  const router = useRouter();

  const [loaded, error] = useFonts({
    FuenteTitulo: require('@/assets/fonts/fuente-dilana.ttf'),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ImageBackground
      source={require('@/assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <View style={styles.contentContainer}>
          <TouchableOpacity style={styles.titleContainer} onPress={() => router.replace('/')}>
            <Svg height="100%" width="100%">
              <SvgText
                fill="black"
                stroke="#FCEEB5"
                strokeWidth="0.8"
                fontSize="50"
                fontFamily="FuenteTitulo"
                x="50%"
                y="45%"
                textAnchor="middle"
              >
                A Tale Of
              </SvgText>

              <SvgText
                fill="black"
                stroke="#FCEEB5"
                strokeWidth="0.8"
                fontSize="50"
                fontFamily="FuenteTitulo"
                x="50%"
                y="95%"
                textAnchor="middle"
              >
                Recognition
              </SvgText>
            </Svg>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/register')}>
            <Text style={styles.primaryButtonText}>Registrarse</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/login')}>
            <Text style={styles.secondaryButtonText}>Iniciar Sesion</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  titleContainer: {
    height: 130,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonsContainer: {
    width: '100%',
    paddingBottom: 80,
    gap: 20,
  },
  primaryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#0f2027',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  secondaryButton: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
