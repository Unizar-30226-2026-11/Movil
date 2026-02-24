import { 
  StyleSheet, Text, View, ImageBackground, Image, 
  TouchableOpacity, ScrollView, SafeAreaView, Modal, ActivityIndicator, 
  Platform, StatusBar 
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons'; 
import { useRouter } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function MainScreen() {
  const router = useRouter();
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'), 
  });

  const [cartasDesplegadas, setCartasDesplegadas] = useState(false);
  const [mapaSeleccionado, setMapaSeleccionado] = useState('Selección Mapa');
  const [mazoSeleccionado, setMazoSeleccionado] = useState('Selección Mazo');
  const [modalVisible, setModalVisible] = useState(false);
  const [tipoModal, setTipoModal] = useState(''); 
  const [buscando, setBuscando] = useState(false);
  const [socialVisible, setSocialVisible] = useState(false);

  const coleccionSurrealista = [
    { id: '1', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=400&q=80' },
    { id: '2', bloqueada: false, nombre: 'Ojo', imagen: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=400&q=80' },
    { id: '3', bloqueada: false, nombre: 'Pájaros', imagen: 'https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?auto=format&fit=crop&w=400&q=80' },
    { id: '4', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80' },
    { id: '5', bloqueada: false, nombre: 'Desierto', imagen: 'https://images.unsplash.com/photo-1506159904225-f82b7b69cd5b?auto=format&fit=crop&w=400&q=80' },
    { id: '6', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=400&q=80' },
  ];

  const amigosMock = [
    { id: '1', nombre: 'hachelpez', estado: 'online', actividad: 'en el menu principal', avatar: 'https://i.pravatar.cc/100?img=11' },
    { id: '2', nombre: 'diegolool', estado: 'online', actividad: 'en partida', avatar: 'https://i.pravatar.cc/100?img=12' },
    { id: '3', nombre: 'marqui1', estado: 'online', actividad: 'en el menu principal', avatar: 'https://i.pravatar.cc/100?img=13' },
    { id: '4', nombre: 'toxisita', estado: 'offline', avatar: 'https://i.pravatar.cc/100?img=14' },
    { id: '5', nombre: 'hector22', estado: 'offline', avatar: 'https://i.pravatar.cc/100?img=15' },
  ];

  const opcionesMapa = ['El Bosque de los Susurros', 'Ciudad Espejismo', 'Ruinas del Tiempo', 'Aleatorio'];
  const opcionesMazo = ['Colección Surrealista', 'Colección Sketch', 'Colección Acuarela', 'Todos mezclados'];

  const abrirModal = (tipo: string) => {
    setTipoModal(tipo);
    setModalVisible(true);
  };

  const seleccionarOpcion = (opcion: string) => {
    if (tipoModal === 'mapa') setMapaSeleccionado(opcion);
    if (tipoModal === 'mazo') setMazoSeleccionado(opcion);
    setModalVisible(false); 
  };

  const iniciarBusqueda = () => {
    setBuscando(true);
    setTimeout(() => {
      setBuscando(false);
      alert('¡Partida encontrada! Llevando a la sala...');
    }, 3000);
  };

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const opcionesActuales = tipoModal === 'mapa' ? opcionesMapa : opcionesMazo;
  const amigosOnline = amigosMock.filter(a => a.estado === 'online');
  const amigosOffline = amigosMock.filter(a => a.estado === 'offline');

  return (
    <ImageBackground
      source={require('../assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        {/* CABECERA CORREGIDA */}
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="28" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={{ padding: 5 }}>
              <Ionicons name="cart-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => setSocialVisible(true)}>
              <Ionicons name="people-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }}>
              <Ionicons name="person-circle-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
            {/* RUTA DE AJUSTES RESTAURADA */}
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTENIDO PRINCIPAL */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.accordionButton} activeOpacity={0.8} onPress={() => setCartasDesplegadas(!cartasDesplegadas)}>
            <Text style={styles.accordionText}>Mis Cartas (12/256)</Text>
            <Ionicons name={cartasDesplegadas ? "chevron-up" : "chevron-down"} size={24} color="#2c3e50" />
          </TouchableOpacity>

          {cartasDesplegadas && (
            <View style={styles.cardsGridContainer}>
              <Text style={styles.collectionTitle}>Colección Surrealista:</Text>
              <View style={styles.cardsGrid}>
                {coleccionSurrealista.map((carta) => (
                  <View key={carta.id} style={styles.cardShadowWrapper}>
                    <View style={styles.cardInner}>
                      <Image source={{ uri: carta.imagen }} style={styles.cardImageAbsolute} resizeMode="cover" />
                      {carta.bloqueada ? (
                        <View style={styles.lockedOverlay}><Ionicons name="lock-closed" size={28} color="#FCEEB5" /></View>
                      ) : (
                        <View style={styles.unlockedOverlay}><Text style={styles.cardText}>{carta.nombre}</Text></View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Sala actual:</Text>
              <View style={styles.playerCountBadge}><Text style={styles.playerCountText}>1/8</Text></View>
            </View>
            <View style={styles.playerRow}>
              <View style={styles.playerInfo}>
                <View style={[styles.statusDot, {backgroundColor: '#FF6B6B'}]} />
                <Text style={styles.playerName}>Tú (Host)</Text>
              </View>
              <View style={styles.playerIcons}>
                <Ionicons name="mic-outline" size={20} color="#2c3e50" />
                <Ionicons name="headset-outline" size={20} color="#2c3e50" />
              </View>
            </View>
            <View style={[styles.playerRow, styles.emptyPlayerRow]}>
               <Text style={styles.emptyPlayerText}>Esperando jugador...</Text>
            </View>
            <TouchableOpacity style={styles.inviteButton} onPress={() => setSocialVisible(true)}>
              <Ionicons name="person-add-outline" size={18} color="#2c3e50" />
              <Text style={styles.inviteButtonText}>Invitar Amigo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.matchmakingContainer}>
            <TouchableOpacity style={styles.dropdownButton} onPress={() => abrirModal('mapa')}>
              <Text style={styles.dropdownText}>{mapaSeleccionado}</Text>
              <Ionicons name="chevron-down" size={20} color="#2c3e50" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.dropdownButton} onPress={() => abrirModal('mazo')}>
              <Text style={styles.dropdownText}>{mazoSeleccionado}</Text>
              <Ionicons name="chevron-down" size={20} color="#2c3e50" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.searchButton, buscando && styles.searchButtonActive]}
              onPress={iniciarBusqueda}
              disabled={buscando}
            >
              {buscando ? (
                <View style={styles.searchingRow}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.searchButtonTextActive}>Buscando...</Text>
                </View>
              ) : (
                <Text style={styles.searchButtonText}>Buscar partida</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* MODAL DE SELECCIÓN (Mapa/Mazo) */}
        <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {tipoModal === 'mapa' ? 'Selecciona un Mapa' : 'Selecciona un Mazo'}
              </Text>
              {opcionesActuales.map((opcion, index) => (
                <TouchableOpacity key={index} style={styles.modalOption} onPress={() => seleccionarOpcion(opcion)}>
                  <Text style={styles.modalOptionText}>{opcion}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ========================================= */}
        {/* PANEL SOCIAL (CAPA ABSOLUTA, NO MODAL) */}
        {/* ========================================= */}
        {socialVisible && (
          <View style={styles.socialOverlayAbsolute}>
            <TouchableOpacity style={styles.socialModalOverlay} activeOpacity={1} onPress={() => setSocialVisible(false)} />
            
            <View style={styles.socialPanel}>
              <View style={styles.socialHeader}>
                <TouchableOpacity onPress={() => setSocialVisible(false)}>
                  <Ionicons name="arrow-back" size={24} color="#FCEEB5" />
                </TouchableOpacity>
                <Text style={styles.socialTitle}>SOCIAL</Text>
                <TouchableOpacity>
                  <Ionicons name="search" size={24} color="#FCEEB5" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.socialScrollContent}>
                <Text style={styles.socialSectionTitle}>CONECTADOS</Text>
                {amigosOnline.map((amigo) => (
                  <View key={amigo.id} style={styles.friendItem}>
                    <View style={styles.friendAvatarContainer}>
                      <Image source={{ uri: amigo.avatar }} style={styles.friendAvatar} />
                      <View style={[styles.friendStatusDot, { backgroundColor: '#2ecc71' }]} />
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{amigo.nombre}</Text>
                      <Text style={styles.friendActivity}>{amigo.actividad}</Text>
                    </View>
                    <TouchableOpacity style={styles.inviteFriendButton}>
                      <Text style={styles.inviteFriendButtonText}>Invitar a la sala</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={styles.socialSectionTitle}>DESCONECTADOS</Text>
                {amigosOffline.map((amigo) => (
                  <View key={amigo.id} style={styles.friendItem}>
                    <View style={styles.friendAvatarContainer}>
                      <Image source={{ uri: amigo.avatar }} style={styles.friendAvatar} />
                      <View style={[styles.friendStatusDot, { backgroundColor: '#95a5a6' }]} />
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{amigo.nombre}</Text>
                    </View>
                    <TouchableOpacity style={styles.messageFriendButton}>
                      <Text style={styles.messageFriendButtonText}>escribir mensaje</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.addFriendButton}>
                <Text style={styles.addFriendButtonText}>Añadir amigo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  
  // CABECERA: Z-Index y Elevation altos
  header: { 
    zIndex: 20, 
    elevation: 20, // <--- NECESARIO EN ANDROID
    backgroundColor: 'rgba(10, 25, 40, 0.95)', 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FCEEB5' 
  },
  headerTitleContainer: { flex: 1, height: 50, marginRight: 10 },
  headerIcons: { flexDirection: 'row', gap: 5 }, // Reduje un poco el gap porque los botones ahora tienen padding
  scrollContent: { padding: 20, gap: 20, paddingBottom: 50 },
  accordionButton: { backgroundColor: '#FCEEB5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 },
  accordionText: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  cardsGridContainer: { backgroundColor: 'rgba(238, 242, 245, 0.95)', borderRadius: 15, padding: 15, marginTop: -10 },
  collectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  cardShadowWrapper: { width: '30%', aspectRatio: 0.65, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5, marginBottom: 10 },
  cardInner: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  cardImageAbsolute: { position: 'absolute', width: '100%', height: '100%' },
  lockedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  unlockedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8 },
  cardText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  panel: { backgroundColor: 'rgba(238, 242, 245, 0.9)', borderRadius: 15, padding: 15 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  panelTitle: { fontSize: 18, color: '#2c3e50' },
  playerCountBadge: { backgroundColor: '#1a2a3a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  playerCountText: { color: '#FCEEB5', fontWeight: 'bold' },
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 8, marginBottom: 8 },
  emptyPlayerRow: { backgroundColor: 'rgba(0,0,0,0.02)', borderStyle: 'dashed', borderWidth: 1, borderColor: '#95a5a6', justifyContent: 'center' },
  emptyPlayerText: { color: '#7f8c8d', fontStyle: 'italic' },
  playerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  playerName: { fontSize: 16, color: '#2c3e50', fontWeight: '500' },
  playerIcons: { flexDirection: 'row', gap: 10 },
  inviteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 12, backgroundColor: '#dce8e3', borderRadius: 8, borderWidth: 1, borderColor: '#A8C8C0' },
  inviteButtonText: { fontWeight: '600', color: '#2c3e50' },
  matchmakingContainer: { gap: 15, marginTop: 10 },
  dropdownButton: { backgroundColor: '#dce8e3', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#A8C8C0' },
  dropdownText: { fontSize: 16, color: '#2c3e50' },
  searchButton: { backgroundColor: '#A8C8C0', paddingVertical: 18, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8, marginTop: 10 },
  searchButtonActive: { backgroundColor: '#6c8b84' },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchButtonText: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', letterSpacing: 1 },
  searchButtonTextActive: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#EEF2F5', borderRadius: 15, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 10 },
  modalOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalOptionText: { fontSize: 16, color: '#2c3e50', textAlign: 'center' },
  modalCloseButton: { marginTop: 15, backgroundColor: '#FF6B6B', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalCloseText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  socialOverlayAbsolute: {
    position: 'absolute', 
    top: 71, 
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 10, 
  },
  socialModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  socialPanel: {
    width: '85%',
    backgroundColor: 'rgba(10, 25, 40, 0.95)', 
    borderLeftWidth: 1,
    borderLeftColor: '#FCEEB5',
  },
  socialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(252, 238, 181, 0.3)' },
  socialTitle: { fontSize: 20, color: '#FCEEB5', fontWeight: 'bold', letterSpacing: 1 },
  socialScrollContent: { padding: 20, paddingBottom: 40 },
  socialSectionTitle: { color: '#8caea6', fontSize: 14, fontWeight: 'bold', marginBottom: 15, marginTop: 10 },
  friendItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 12, marginBottom: 10 },
  friendAvatarContainer: { position: 'relative', marginRight: 15 },
  friendAvatar: { width: 50, height: 50, borderRadius: 25 },
  friendStatusDot: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#0f2027' },
  friendInfo: { flex: 1 },
  friendName: { color: '#FCEEB5', fontSize: 16, fontWeight: 'bold' },
  friendActivity: { color: '#8caea6', fontSize: 12 },
  inviteFriendButton: { backgroundColor: '#A8C8C0', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  inviteFriendButtonText: { color: '#2c3e50', fontSize: 12, fontWeight: 'bold' },
  messageFriendButton: { backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#8caea6' },
  messageFriendButtonText: { color: '#FCEEB5', fontSize: 12 },
  addFriendButton: { backgroundColor: '#A8C8C0', margin: 20, paddingVertical: 15, borderRadius: 30, alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  addFriendButtonText: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
});