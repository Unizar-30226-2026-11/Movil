import { 
  StyleSheet, Text, View, ImageBackground, Image, 
  TouchableOpacity, ScrollView, SafeAreaView, Alert, Modal, TextInput 
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons'; 
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Memoria local

SplashScreen.preventAutoHideAsync();

export default function ProfileScreen() {
  const router = useRouter();

  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'), 
  });

  // --- ESTADOS DEL USUARIO ---
  const [usuario, setUsuario] = useState({
    nombre: "Miguel",
    titulo: "Rey del tablero",
    nivel: 14,
    avatar: 'https://i.pravatar.cc/150?img=18',
    estadisticas: {
      partidas: 42,
      victorias: 28,
      cartas: 64
    }
  });

  // --- ESTADOS PARA LOS MODALES ---
  const [modalPerfilVisible, setModalPerfilVisible] = useState(false);
  const [modalPasswordVisible, setModalPasswordVisible] = useState(false);

  // Variables temporales para editar el perfil
  const [tempNombre, setTempNombre] = useState('');
  const [tempTitulo, setTempTitulo] = useState('');

  // Variables para la contraseña
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');

  // --- CARGAR DATOS AL INICIAR ---
  useEffect(() => {
    const cargarPerfil = async () => {
      try {
        const perfilGuardado = await AsyncStorage.getItem('perfilUsuario');
        if (perfilGuardado !== null) {
          setUsuario(JSON.parse(perfilGuardado));
        }
      } catch (e) {
        console.log("Error cargando perfil", e);
      }
    };
    cargarPerfil();
  }, []);

  // --- FUNCIONES DE GUARDADO ---
  const abrirModalPerfil = () => {
    setTempNombre(usuario.nombre);
    setTempTitulo(usuario.titulo);
    setModalPerfilVisible(true);
  };

  const guardarPerfil = async () => {
    if (tempNombre.trim() === '') {
      Alert.alert("Error", "El nombre no puede estar vacío");
      return;
    }

    const usuarioActualizado = { 
      ...usuario, 
      nombre: tempNombre, 
      titulo: tempTitulo 
    };

    try {
      await AsyncStorage.setItem('perfilUsuario', JSON.stringify(usuarioActualizado));
      setUsuario(usuarioActualizado);
      setModalPerfilVisible(false);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el perfil.");
    }
  };

  const guardarPassword = () => {
    if (passwordActual === '' || nuevaPassword === '' || confirmarPassword === '') {
      Alert.alert("Error", "Por favor, rellena todos los campos.");
      return;
    }
    if (nuevaPassword !== confirmarPassword) {
      Alert.alert("Error", "Las nuevas contraseñas no coinciden.");
      return;
    }

    // Aqui iria la lógica del backend
    Alert.alert("¡Éxito!", "Contraseña actualizada correctamente.");
    setModalPasswordVisible(false);
    setPasswordActual('');
    setNuevaPassword('');
    setConfirmarPassword('');
  };

  const cerrarSesion = () => {
    Alert.alert(
      "Cerrar Sesión", 
      "¿Seguro que quieres salir de tu cuenta?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, salir", onPress: () => router.replace('/login') } 
      ]
    );
  };

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
        
        {/* CABECERA */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 5 }}>
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
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/store')}>
              <Ionicons name="cart-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTENIDO PRINCIPAL */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.panel}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarContainer}>
                <Image source={{ uri: usuario.avatar }} style={styles.avatar} />
                <TouchableOpacity style={styles.editAvatarButton} onPress={() => Alert.alert('Avatar', 'Próximamente: Galería de avatares')}>
                  <Ionicons name="camera" size={16} color="#0f2027" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.profileInfo}>
                <Text style={styles.username}>{usuario.nombre}</Text>
                <Text style={styles.userTitle}>{usuario.titulo}</Text>
                
                <View style={styles.levelContainer}>
                  <Text style={styles.levelText}>Nivel {usuario.nivel}</Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: '65%' }]} />
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Ionicons name="game-controller-outline" size={24} color="#2c3e50" />
              <Text style={styles.statNumber}>{usuario.estadisticas.partidas}</Text>
              <Text style={styles.statLabel}>Partidas</Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="trophy-outline" size={24} color="#d4af37" />
              <Text style={styles.statNumber}>{usuario.estadisticas.victorias}</Text>
              <Text style={styles.statLabel}>Victorias</Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="images-outline" size={24} color="#2c3e50" />
              <Text style={styles.statNumber}>{usuario.estadisticas.cartas}</Text>
              <Text style={styles.statLabel}>Cartas</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Ajustes de Cuenta</Text>
            
            {/* Botón Editar Perfil */}
            <TouchableOpacity style={styles.menuItem} onPress={abrirModalPerfil}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="person-outline" size={22} color="#2c3e50" />
                <Text style={styles.menuItemText}>Editar información pública</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#95a5a6" />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Botón Cambiar Contraseña */}
            <TouchableOpacity style={styles.menuItem} onPress={() => setModalPasswordVisible(true)}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="lock-closed-outline" size={22} color="#2c3e50" />
                <Text style={styles.menuItemText}>Cambiar contraseña</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#95a5a6" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Correo', 'Próximamente')}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="mail-outline" size={22} color="#2c3e50" />
                <Text style={styles.menuItemText}>Vincular correo electrónico</Text>
              </View>
              <Text style={styles.menuItemBadge}>Recomendado</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={cerrarSesion}>
            <Ionicons name="log-out-outline" size={20} color="#c0392b" />
            <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
          </TouchableOpacity>

        </ScrollView>

        {/* ============================================== */}
        {/* MODAL: EDITAR PERFIL                           */}
        {/* ============================================== */}
        <Modal visible={modalPerfilVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.formBox}>
              <Text style={styles.modalTitle}>Editar Perfil</Text>
              
              <Text style={styles.inputLabel}>Nombre de usuario</Text>
              <TextInput 
                style={styles.input}
                value={tempNombre}
                onChangeText={setTempNombre}
                placeholder="Escribe tu nombre"
                placeholderTextColor="#6b6b6b"
              />

              <Text style={styles.inputLabel}>Título personal</Text>
              <TextInput 
                style={styles.input}
                value={tempTitulo}
                onChangeText={setTempTitulo}
                placeholder="Escribe tu título"
                placeholderTextColor="#6b6b6b"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setModalPerfilVisible(false)}>
                  <Text style={styles.buttonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={guardarPerfil}>
                  <Text style={styles.buttonText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ============================================== */}
        {/* MODAL: CAMBIAR CONTRASEÑA                      */}
        {/* ============================================== */}
        <Modal visible={modalPasswordVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.formBox}>
              <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
              
              <TextInput 
                style={[styles.input, { marginBottom: 15 }]}
                value={passwordActual}
                onChangeText={setPasswordActual}
                placeholder="Contraseña actual"
                placeholderTextColor="#6b6b6b"
                secureTextEntry
              />

              <TextInput 
                style={[styles.input, { marginBottom: 15 }]}
                value={nuevaPassword}
                onChangeText={setNuevaPassword}
                placeholder="Nueva contraseña"
                placeholderTextColor="#6b6b6b"
                secureTextEntry
              />

              <TextInput 
                style={styles.input}
                value={confirmarPassword}
                onChangeText={setConfirmarPassword}
                placeholder="Repetir nueva contraseña"
                placeholderTextColor="#6b6b6b"
                secureTextEntry
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => {
                  setModalPasswordVisible(false);
                  setPasswordActual('');
                  setNuevaPassword('');
                  setConfirmarPassword('');
                }}>
                  <Text style={styles.buttonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={guardarPassword}>
                  <Text style={styles.buttonText}>Actualizar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  
  header: { 
    zIndex: 20, elevation: 20, 
    backgroundColor: 'rgba(10, 25, 40, 0.95)', 
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FCEEB5' 
  },
  headerTitleContainer: { flex: 1, height: 40, alignItems: 'center' },
  headerIcons: { flexDirection: 'row', gap: 5 },
  
  scrollContent: { padding: 20, gap: 20, paddingBottom: 50 },

  panel: { backgroundColor: 'rgba(238, 242, 245, 0.95)', borderRadius: 15, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 6 },
  
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#A8C8C0' },
  editAvatarButton: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#FCEEB5', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#0f2027' },
  profileInfo: { flex: 1 },
  username: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50' },
  userTitle: { fontSize: 14, color: '#7f8c8d', fontStyle: 'italic', marginBottom: 8 },
  levelContainer: { marginTop: 5 },
  levelText: { fontSize: 12, fontWeight: 'bold', color: '#2c3e50', marginBottom: 4 },
  progressBarBg: { width: '100%', height: 8, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#A8C8C0' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  statBox: { flex: 1, backgroundColor: 'rgba(238, 242, 245, 0.95)', borderRadius: 15, padding: 15, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 4 },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginTop: 5 },
  statLabel: { fontSize: 12, color: '#7f8c8d', marginTop: 2 },

  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  menuItemText: { fontSize: 16, color: '#2c3e50' },
  menuItemBadge: { backgroundColor: '#e5c9c5', color: '#c0392b', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 5 },

  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e5c9c5', paddingVertical: 16, borderRadius: 15, borderWidth: 1, borderColor: '#d2a6a1', marginTop: 10 },
  logoutButtonText: { color: '#c0392b', fontSize: 16, fontWeight: 'bold' },

  // --- ESTILOS PARA LOS MODALES Y FORMULARIOS ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  formBox: { width: '85%', backgroundColor: '#EEF2F5', padding: 25, borderRadius: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20, textAlign: 'center' },
  
  inputLabel: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginBottom: 5, marginLeft: 5 },
  input: { 
    width: '100%', 
    backgroundColor: '#FCEEB5', 
    paddingVertical: 12, 
    paddingHorizontal: 15, 
    borderRadius: 10, 
    fontSize: 16, 
    borderWidth: 1, 
    borderColor: '#d4c494',
    marginBottom: 20 
  },
  
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelButton: { backgroundColor: '#FF6B6B', paddingVertical: 12, borderRadius: 10, width: '48%', alignItems: 'center' },
  saveButton: { backgroundColor: '#A8C8C0', paddingVertical: 12, borderRadius: 10, width: '48%', alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 2 },
});