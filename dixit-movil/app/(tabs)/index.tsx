import { ImageBackground, StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { useFonts } from 'expo-font'; 
import * as SplashScreen from 'expo-splash-screen'; 
import { useEffect } from 'react';
import { useRouter } from 'expo-router'; 
// 1. IMPORTAMOS LA LIBRERÍA DE DIBUJO
import Svg, { Text as SvgText } from 'react-native-svg';

SplashScreen.preventAutoHideAsync();

export default function HomeScreen() {
  const router = useRouter(); 

  const [loaded, error] = useFonts({
    'FuenteTitulo': require('@/assets/fonts/fuente-dilana.ttf'), 
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
          
          {/* 2. REEMPLAZAMOS LOS <Text> POR EL SVG EN DOS LÍNEAS */}
          <View style={{ height: 130, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Svg height="100%" width="100%">
              
              {/* Primera línea: "A Tale Of" */}
              <SvgText
                fill="black"
                stroke="#FCEEB5"
                strokeWidth="0.8"
                fontSize="50"
                fontFamily="FuenteTitulo"
                x="50%"
                y="45%" // Posición más arriba
                textAnchor="middle"
              >
                A Tale Of
              </SvgText>

              {/* Segunda línea: "Recognition" */}
              <SvgText
                fill="black"
                stroke="#FCEEB5"
                strokeWidth="0.8"
                fontSize="50"
                fontFamily="FuenteTitulo"
                x="50%"
                y="95%" // Posición más abajo
                textAnchor="middle"
              >
                Recognition
              </SvgText>
              
            </Svg>
          </View>
          
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => router.push('/register')} 
          >
            <Text style={styles.primaryButtonText}>Registrarse</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
           // Añadimos la ruta de navegación aquí
            onPress={() => router.push('/login')}
          >
           <Text style={styles.secondaryButtonText}>Iniciar Sesión</Text>
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
  // (He borrado el estilo customTitle porque ya está configurado dentro del SvgText)

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
    shadowColor: "#000",
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