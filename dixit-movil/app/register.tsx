import {
  StyleSheet, View, ImageBackground,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Text, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';

SplashScreen.preventAutoHideAsync();

const API_URL = 'http://192.168.1.20:3000/api';

export default function RegisterScreen() {
  const router = useRouter();

  // Estados para capturar lo que escribe el usuario
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // Lógica de conexión
  const handleRegister = async () => {
    if (!email || !username || !password) {
      Alert.alert("Error", "Rellena todos los campos.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      });

      const data = await response.json();

      if (response.ok) { // Código 200/201
        Alert.alert("¡Éxito!", "Cuenta creada. Ahora inicia sesión.", [
          { text: "Ir al Login", onPress: () => router.back() }
        ]);
      } else { // Errores del backend
        Alert.alert("Error", data.message || "Fallo en el registro");
      }
    } catch (e) {
      Alert.alert("Error de red", "No se puede conectar con el servidor.");
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground source={require('../assets/images/background.jpg')} style={styles.background} resizeMode="cover">
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardContainer}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            <View style={{ height: 70, width: '100%', marginBottom: 30, justifyContent: 'center', alignItems: 'center' }}>
              <Svg height="100%" width="100%">
                <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="42" fontFamily="FuenteTitulo" x="50%" y="55%" textAnchor="middle">
                  A Tale Of Recognition
                </SvgText>
              </Svg>
            </View>

            <View style={styles.formContainer}>
              <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                placeholderTextColor="#6b6b6b"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Nombre de Usuario"
                placeholderTextColor="#6b6b6b"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
              <TextInput
                style={styles.input}
                placeholder="Contraseña"
                placeholderTextColor="#6b6b6b"
                secureTextEntry={true}
                value={password}
                onChangeText={setPassword}
              />

              <TouchableOpacity style={styles.registerButton} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#2c3e50" /> : <Text style={styles.registerButtonText}>Registrarse</Text>}
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        <TouchableOpacity style={styles.loginButtonCorner} onPress={() => router.back()}>
          <Text style={styles.loginButtonText}>Ya tengo cuenta</Text>
        </TouchableOpacity>

      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  keyboardContainer: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 50 },
  formContainer: { width: '85%', alignItems: 'center', gap: 20 },
  input: { width: '100%', backgroundColor: '#FCEEB5', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#d4c494', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 3 },
  registerButton: { marginTop: 20, backgroundColor: '#A8C8C0', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 25, borderWidth: 2, borderColor: '#8caea6', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  registerButtonText: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  loginButtonCorner: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#A8C8C0', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 20, borderWidth: 1, borderColor: '#8caea6', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  loginButtonText: { fontSize: 14, fontWeight: '600', color: '#2c3e50' },
});