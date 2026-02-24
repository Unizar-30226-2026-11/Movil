import { 
  StyleSheet, Text, View, ImageBackground, 
  TouchableOpacity, ScrollView, SafeAreaView, Switch, Alert 
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons'; 
import { useRouter } from 'expo-router';
import Slider from '@react-native-community/slider';

// IMPORTAMOS LA LIBRERÍA DE MEMORIA
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

export default function SettingsScreen() {
  const router = useRouter();

  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'), 
  });

  // --- ESTADOS DE CONFIGURACIÓN (Con valores por defecto) ---
  const [sonido, setSonido] = useState(0.8);
  const [musica, setMusica] = useState(0.5);
  const [notificaciones, setNotificaciones] = useState(true);
  const [estadoOnline, setEstadoOnline] = useState(true);
  const [vibracion, setVibracion] = useState(true);

  // --- MAGIA DE CARGAR DATOS AL ENTRAR ---
  useEffect(() => {
    const cargarConfiguracion = async () => {
      try {
        // Buscamos en la memoria interna el "paquete" llamado 'ajustesUsuario'
        const ajustesGuardados = await AsyncStorage.getItem('ajustesUsuario');
        
        if (ajustesGuardados !== null) {
          // Si existe, lo transformamos de texto a código entendible (JSON)
          const ajustes = JSON.parse(ajustesGuardados);
          
          // Actualizamos nuestros botones y barras con lo que hemos encontrado
          setSonido(ajustes.sonido);
          setMusica(ajustes.musica);
          setNotificaciones(ajustes.notificaciones);
          setEstadoOnline(ajustes.estadoOnline);
          setVibracion(ajustes.vibracion);
        }
      } catch (e) {
        console.log("Error cargando ajustes", e);
      }
    };

    cargarConfiguracion(); // Ejecutamos la función nada más entrar a la pantalla
  }, []);

  // --- FUNCIONES DE LOS BOTONES ---
  const resetearConfiguracion = () => {
    Alert.alert(
      "Reestablecer", 
      "¿Seguro que quieres volver a los ajustes por defecto?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, reestablecer", onPress: () => {
            setSonido(0.8);
            setMusica(0.5);
            setNotificaciones(true);
            setEstadoOnline(true);
            setVibracion(true);
        }}
      ]
    );
  };

  const guardarCambios = async () => {
    try {
      // 1. Empaquetamos todo en un objeto
      const ajustesParaGuardar = {
        sonido: sonido,
        musica: musica,
        notificaciones: notificaciones,
        estadoOnline: estadoOnline,
        vibracion: vibracion
      };

      // 2. Lo guardamos en el móvil bajo el nombre 'ajustesUsuario' (hay que pasarlo a texto)
      await AsyncStorage.setItem('ajustesUsuario', JSON.stringify(ajustesParaGuardar));
      
      Alert.alert("¡Éxito!", "Configuración guardada correctamente en tu dispositivo.", [
        { text: "OK", onPress: () => router.back() } 
      ]);

    } catch (e) {
      Alert.alert("Error", "No se pudo guardar la configuración.");
      console.log("Error guardando ajustes", e);
    }
  };

  // --- CARGA DE FUENTES ---
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#FCEEB5" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="26" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity><Ionicons name="cart-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity><Ionicons name="people-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity><Ionicons name="person-circle-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.settingsPanel}>
            <Text style={styles.panelTitle}>Configuración:</Text>

            <View style={styles.settingRowBlock}>
              <Text style={styles.settingLabel}>Sonido</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={sonido}
                onValueChange={setSonido}
                minimumTrackTintColor="#2c3e50"
                maximumTrackTintColor="#bdc3c7"
                thumbTintColor="#2c3e50"
              />
            </View>

            <View style={styles.settingRowBlock}>
              <Text style={styles.settingLabel}>Música</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={musica}
                onValueChange={setMusica}
                minimumTrackTintColor="#2c3e50"
                maximumTrackTintColor="#bdc3c7"
                thumbTintColor="#2c3e50"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRowInline}>
              <Text style={styles.settingLabelInline}>Notificaciones</Text>
              <View style={styles.switchContainer}>
                <Text style={styles.switchText}>Desactivadas</Text>
                <Switch
                  trackColor={{ false: "#95a5a6", true: "#A8C8C0" }}
                  thumbColor={notificaciones ? "#2c3e50" : "#f4f3f4"}
                  onValueChange={setNotificaciones}
                  value={notificaciones}
                />
                <Text style={styles.switchText}>Activadas</Text>
              </View>
            </View>

            <View style={styles.settingRowInline}>
              <Text style={styles.settingLabelInline}>Mostrar estado online</Text>
              <View style={styles.switchContainer}>
                <Text style={styles.switchText}>Oculto</Text>
                <Switch
                  trackColor={{ false: "#95a5a6", true: "#A8C8C0" }}
                  thumbColor={estadoOnline ? "#2c3e50" : "#f4f3f4"}
                  onValueChange={setEstadoOnline}
                  value={estadoOnline}
                />
                <Text style={styles.switchText}>Visible</Text>
              </View>
            </View>

            <View style={styles.settingRowInline}>
              <Text style={styles.settingLabelInline}>Vibración</Text>
              <View style={styles.switchContainer}>
                <Text style={styles.switchText}>No</Text>
                <Switch
                  trackColor={{ false: "#95a5a6", true: "#A8C8C0" }}
                  thumbColor={vibracion ? "#2c3e50" : "#f4f3f4"}
                  onValueChange={setVibracion}
                  value={vibracion}
                />
                <Text style={styles.switchText}>Sí</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity style={[styles.actionButton, styles.resetButton]} onPress={resetearConfiguracion}>
              <Text style={styles.resetButtonText}>Reestablecer por defecto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={guardarCambios}>
              <Text style={styles.saveButtonText}>Guardar cambios</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  header: { backgroundColor: 'rgba(10, 25, 40, 0.95)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FCEEB5' },
  backButton: { marginRight: 10 },
  headerTitleContainer: { flex: 1, height: 40 },
  headerIcons: { flexDirection: 'row', gap: 15 },
  scrollContent: { padding: 20, gap: 20, paddingBottom: 50 },
  settingsPanel: { backgroundColor: 'rgba(238, 242, 245, 0.95)', borderRadius: 15, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 6 },
  panelTitle: { fontSize: 24, color: '#2c3e50', marginBottom: 20 },
  settingRowBlock: { marginBottom: 20, backgroundColor: 'rgba(0,0,0,0.05)', padding: 15, borderRadius: 10 },
  settingLabel: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  slider: { width: '100%', height: 40 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.1)', marginVertical: 10, marginBottom: 20 },
  settingRowInline: { marginBottom: 15, backgroundColor: 'rgba(0,0,0,0.05)', padding: 15, borderRadius: 10, gap: 10 },
  settingLabelInline: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  switchContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchText: { fontSize: 14, color: '#7f8c8d' },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 },
  actionButton: { flex: 1, paddingVertical: 15, paddingHorizontal: 10, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 },
  resetButton: { backgroundColor: '#e5c9c5', borderColor: '#d2a6a1' },
  resetButtonText: { color: '#c0392b', fontWeight: 'bold', textAlign: 'center', fontSize: 14 },
  saveButton: { backgroundColor: '#A8C8C0', borderColor: '#8caea6' },
  saveButtonText: { color: '#2c3e50', fontWeight: 'bold', textAlign: 'center', fontSize: 16 },
});