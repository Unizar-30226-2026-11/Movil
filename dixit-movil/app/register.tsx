import {
  StyleSheet, View, ImageBackground,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Text
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';

SplashScreen.preventAutoHideAsync();

export default function RegisterScreen() {
  const router = useRouter();

  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

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
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardContainer}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* TÍTULO SVG CON COLORES INVERTIDOS */}
            <View style={{ height: 70, width: '100%', marginBottom: 30, justifyContent: 'center', alignItems: 'center' }}>
              <Svg height="100%" width="100%">
                <SvgText
                  fill="black"         // <--- AHORA EL RELLENO ES NEGRO
                  stroke="#FCEEB5"     // <--- AHORA EL BORDE ES AMARILLO/CREMA
                  strokeWidth="0.8"
                  fontSize="42"
                  fontFamily="FuenteTitulo"
                  x="50%"
                  y="55%"
                  textAnchor="middle"
                >
                  A Tale Of Recognition
                </SvgText>
              </Svg>
            </View>
            {/* FIN DEL TÍTULO SVG */}


            <View style={styles.formContainer}>
              <TextInput
                style={styles.input}
                placeholder="Nombre de Usuario"
                placeholderTextColor="#6b6b6b"
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                placeholderTextColor="#6b6b6b"
                secureTextEntry={true}
              />
              <TextInput
                style={styles.input}
                placeholder="Repetir Contraseña"
                placeholderTextColor="#6b6b6b"
                secureTextEntry={true}
              />

              <TouchableOpacity style={styles.registerButton}>
                 <Text style={styles.registerButtonText}>Registrarse</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        <TouchableOpacity
          style={styles.loginButtonCorner}
          onPress={() => router.back()}
        >
          <Text style={styles.loginButtonText}>Ya tengo cuenta</Text>
        </TouchableOpacity>

      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  formContainer: {
    width: '85%',
    alignItems: 'center',
    gap: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#FCEEB5',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#d4c494',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
  },
  registerButton: {
    marginTop: 20,
    backgroundColor: '#A8C8C0',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#8caea6',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  registerButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  loginButtonCorner: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#A8C8C0',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#8caea6',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
});