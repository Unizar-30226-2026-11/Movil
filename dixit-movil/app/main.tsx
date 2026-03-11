import { 
  StyleSheet, Text, View, ImageBackground, Image, 
  TouchableOpacity, ScrollView, SafeAreaView, Modal, ActivityIndicator, 
  Platform, StatusBar, TextInput, Alert 
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons'; 
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

const API_URL = 'http://192.168.1.20:3000/api'; 

const MODES_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; }> = {
  classic: { label: 'DIXIT CLÁSICO', icon: 'color-wand-outline', color: '#FCEEB5' },
  stella: { label: 'STELLA', icon: 'sparkles-outline', color: '#a29bfe' },
};

export default function MainScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const currentMode = (mode && MODES_CONFIG[mode]) || { label: 'MODO DESCONOCIDO', icon: 'help-circle-outline', color: '#FCEEB5' };
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
  
  // --- ESTADOS SOCIALES ---
  const [socialVisible, setSocialVisible] = useState(false);
  const [verPeticiones, setVerPeticiones] = useState(false); // Nuevo control para el botón de peticiones
  const [votos, setVotos] = useState(458);
  const [miVoto, setMiVoto] = useState(0); 
  
  const [amigos, setAmigos] = useState<any[]>([]);
  const [solicitudes, setSolicitudes] = useState<any[]>([]);

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalMensajeVisible, setModalMensajeVisible] = useState(false);
  const [amigoMensaje, setAmigoMensaje] = useState<any>(null);
  const [textoMensaje, setTextoMensaje] = useState('');
  const [modalAñadirVisible, setModalAñadirVisible] = useState(false);
  const [nuevoAmigoNombre, setNuevoAmigoNombre] = useState('');

  const coleccionSurrealista = [
    { id: '1', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=400&q=80' },
    { id: '2', bloqueada: false, nombre: 'Ojo', imagen: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=400&q=80' },
    { id: '3', bloqueada: false, nombre: 'Pájaros', imagen: 'https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?auto=format&fit=crop&w=400&q=80' },
    { id: '4', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80' },
  ];
  const opcionesMapa = ['El Bosque de los Susurros', 'Ciudad Espejismo', 'Ruinas del Tiempo', 'Aleatorio'];
  const opcionesMazo = ['Colección Surrealista', 'Colección Sketch', 'Colección Acuarela', 'Todos mezclados'];

  // Cargar lista de amigos confirmados
  const fetchAmigos = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.friends) {
          setAmigos(data.friends.map((amigo: any) => ({
            id: amigo.id,
            nombre: amigo.username,
            estado: amigo.status || 'offline',
            actividad: amigo.status === 'online' ? 'En línea' : '',
            avatar: `https://i.pravatar.cc/150?u=${amigo.username}`
          })));
        }
      }
    } catch (error) {
      console.log("Error cargando amigos:", error);
    }
  };

  // Cargar solicitudes pendientes
  const fetchSolicitudes = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/friends/requests`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSolicitudes(data.pendingRequests || []);
      }
    } catch (error) {
      console.log("Error cargando solicitudes:", error);
    }
  };

  const añadirAmigo = async () => {
    if (nuevoAmigoNombre.trim() === '') return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      const searchRes = await fetch(`${API_URL}/users/search?q=${nuevoAmigoNombre}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const searchData = await searchRes.json();
      const targetId = searchData.results && searchData.results[0]?.id;

      if (!targetId) return Alert.alert("Error", "Jugador no encontrado.");

      const reqRes = await fetch(`${API_URL}/friends/requests`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetId }) 
      });

      if (reqRes.ok) {
        Alert.alert("Éxito", `Petición enviada a ${nuevoAmigoNombre}.`);
        setModalAñadirVisible(false);
        setNuevoAmigoNombre('');
      }
    } catch (error) {
      console.log(error);
    }
  };

  const gestionarSolicitud = async (requestId: string, accion: 'accept' | 'reject') => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/friends/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: accion })
      });

      if (response.ok) {
        setSolicitudes(solicitudes.filter(r => r.id !== requestId));
        fetchAmigos(); // Refrescamos la lista para ver al nuevo amigo inmediatamente
        Alert.alert("Social", accion === 'accept' ? "¡Solicitud aceptada!" : "Solicitud rechazada");
      }
    } catch (error) {
      console.log(error);
    }
  };

  const eliminarAmigo = (id: string, nombre: string) => {
    Alert.alert("Eliminar", `¿Seguro que quieres borrar a ${nombre}?`, [
      { text: "No", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('userToken');
            await fetch(`${API_URL}/friends/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            setAmigos(amigos.filter(a => a.id !== id));
          } catch (error) { console.log(error); }
      }}
    ]);
  };

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
    fetchAmigos();
    fetchSolicitudes();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const abrirModal = (tipo: string) => { setTipoModal(tipo); setModalVisible(true); };
  const seleccionarOpcion = (opcion: string) => {
    if (tipoModal === 'mapa') setMapaSeleccionado(opcion);
    if (tipoModal === 'mazo') setMazoSeleccionado(opcion);
    setModalVisible(false); 
  };

  const iniciarBusqueda = () => {
    setBuscando(true);
    setTimeout(() => { setBuscando(false); router.push('/gameScreen'); }, 3000);
  };

  const manejarVoto = (tipo: number) => {
    if (miVoto === tipo) { setMiVoto(0); setVotos(votos - tipo); } 
    else { setVotos(votos - miVoto + tipo); setMiVoto(tipo); }
  };

  const enviarMensaje = () => {
    if (textoMensaje.trim() === '') return;
    Alert.alert("Mensaje enviado", `A ${amigoMensaje.nombre}: "${textoMensaje}"`);
    setModalMensajeVisible(false);
    setTextoMensaje('');
  };

  const invitarAmigo = (nombre: string) => { Alert.alert("Invitación enviada", `Has invitado a ${nombre} a tu sala.`); };

  const opcionesActuales = tipoModal === 'mapa' ? opcionesMapa : opcionesMazo;
  const amigosFiltrados = amigos.filter(a => a.nombre.toLowerCase().includes(searchQuery.toLowerCase()));
  const amigosOnline = amigosFiltrados.filter(a => a.estado === 'online');
  const amigosOffline = amigosFiltrados.filter(a => a.estado !== 'online');

  return (
    <ImageBackground source={require('../assets/images/background.jpg')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Svg height="100%" width="100%" viewBox="0 0 300 50">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="28" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </View>
          
          <View style={styles.headerIcons}>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/store')}><Ionicons name="cart-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => setSocialVisible(true)}><Ionicons name="people-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/profile')}><Ionicons name="person-circle-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/setting')}><Ionicons name="settings-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.modeBanner, { borderColor: currentMode.color }]}>
            <Ionicons name={currentMode.icon} size={16} color={currentMode.color} />
            <Text style={[styles.modeBannerText, { color: currentMode.color }]}>{currentMode.label}</Text>
          </View>
          
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

          {/* PANEL DE CARTA DE LA COMUNIDAD (MANTENIDO) */}
          <View style={styles.communityPanel}>
            <Text style={styles.communityTitle}>Carta de la Comunidad:</Text>
            <View style={styles.communityImageContainer}>
              <Image source={{ uri: 'https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?auto=format&fit=crop&w=600&q=80' }} style={styles.communityImage} resizeMode="cover" />
            </View>
            <Text style={styles.communitySubtitle}>Donde nacen las sombras</Text>
            <View style={styles.communityFooter}>
              <View style={styles.voteControls}>
                <TouchableOpacity style={[styles.voteButton, miVoto === 1 && styles.voteButtonActiveUp]} onPress={() => manejarVoto(1)}>
                  <Ionicons name="arrow-up" size={18} color="white" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.voteButton, miVoto === -1 && styles.voteButtonActiveDown]} onPress={() => manejarVoto(-1)}>
                  <Ionicons name="arrow-down" size={18} color="white" />
                </TouchableOpacity>
                <View style={styles.voteBadge}><Text style={styles.voteBadgeText}>{votos}</Text></View>
              </View>
              <View style={styles.starsContainer}>
                <Ionicons name="star" size={20} color="#2c3e50" /><Ionicons name="star" size={20} color="#2c3e50" /><Ionicons name="star" size={20} color="#2c3e50" /><Ionicons name="star-outline" size={20} color="#2c3e50" /><Ionicons name="star-outline" size={20} color="#2c3e50" />
              </View>
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Sala actual:</Text>
              <View style={styles.playerCountBadge}><Text style={styles.playerCountText}>1/8</Text></View>
            </View>
            <View style={styles.playerRow}>
              <View style={styles.playerInfo}>
                <View style={[styles.statusDot, {backgroundColor: '#FF6B6B'}]} /><Text style={styles.playerName}>Tú (Host)</Text>
              </View>
              <View style={styles.playerIcons}>
                <Ionicons name="mic-outline" size={20} color="#2c3e50" /><Ionicons name="headset-outline" size={20} color="#2c3e50" />
              </View>
            </View>
            <View style={[styles.playerRow, styles.emptyPlayerRow]}><Text style={styles.emptyPlayerText}>Esperando jugador...</Text></View>
            <TouchableOpacity style={styles.inviteButton} onPress={() => setSocialVisible(true)}>
              <Ionicons name="person-add-outline" size={18} color="#2c3e50" /><Text style={styles.inviteButtonText}>Invitar Amigo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.matchmakingContainer}>
            <TouchableOpacity style={styles.dropdownButton} onPress={() => abrirModal('mapa')}><Text style={styles.dropdownText}>{mapaSeleccionado}</Text><Ionicons name="chevron-down" size={20} color="#2c3e50" /></TouchableOpacity>
            <TouchableOpacity style={styles.dropdownButton} onPress={() => abrirModal('mazo')}><Text style={styles.dropdownText}>{mazoSeleccionado}</Text><Ionicons name="chevron-down" size={20} color="#2c3e50" /></TouchableOpacity>
            <TouchableOpacity style={[styles.searchButton, buscando && styles.searchButtonActive]} onPress={iniciarBusqueda} disabled={buscando}>
              {buscando ? (
                <View style={styles.searchingRow}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.searchButtonTextActive}>Buscando...</Text></View>
              ) : <Text style={styles.searchButtonText}>Buscar partida</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{tipoModal === 'mapa' ? 'Mapa' : 'Mazo'}</Text>
              {opcionesActuales.map((opcion, index) => (
                <TouchableOpacity key={index} style={styles.modalOption} onPress={() => seleccionarOpcion(opcion)}><Text style={styles.modalOptionText}>{opcion}</Text></TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {socialVisible && (
          <View style={styles.socialOverlayAbsolute}>
            <TouchableOpacity style={styles.socialModalOverlay} activeOpacity={1} onPress={() => setSocialVisible(false)} />
            <View style={styles.socialPanel}>
              <View style={styles.socialHeader}>
                <TouchableOpacity onPress={() => setSocialVisible(false)}><Ionicons name="arrow-back" size={24} color="#FCEEB5" /></TouchableOpacity>
                {isSearching ? <TextInput style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery} autoFocus /> : <Text style={styles.socialTitle}>SOCIAL</Text>}
                <TouchableOpacity onPress={() => setIsSearching(!isSearching)}><Ionicons name={isSearching ? "close" : "search"} size={24} color="#FCEEB5" /></TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.socialScrollContent}>
                {/* BOTÓN PARA VER PETICIONES PENDIENTES */}
                <TouchableOpacity style={styles.accordionButton} onPress={() => setVerPeticiones(!verPeticiones)}>
                  <Text style={styles.accordionText}>Peticiones ({solicitudes.length})</Text>
                  <Ionicons name={verPeticiones ? "chevron-up" : "chevron-down"} size={20} color="#2c3e50" />
                </TouchableOpacity>

                {verPeticiones && solicitudes.map((req) => (
                  <View key={req.id} style={[styles.friendItem, { marginTop: 5, borderLeftWidth: 3, borderLeftColor: '#FCEEB5' }]}>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{req.fromUser?.username || "Jugador"}</Text>
                      <Text style={styles.friendActivity}>Solicitud recibida</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => gestionarSolicitud(req.id, 'accept')}><Ionicons name="checkmark-circle" size={28} color="#2ecc71" /></TouchableOpacity>
                      <TouchableOpacity onPress={() => gestionarSolicitud(req.id, 'reject')}><Ionicons name="close-circle" size={28} color="#e74c3c" /></TouchableOpacity>
                    </View>
                  </View>
                ))}

                {amigosOnline.length > 0 && <Text style={styles.socialSectionTitle}>CONECTADOS</Text>}
                {amigosOnline.map((amigo) => (
                  <View key={amigo.id} style={styles.friendItem}>
                    <Image source={{ uri: amigo.avatar }} style={styles.friendAvatar} />
                    <View style={styles.friendInfo}><Text style={styles.friendName}>{amigo.nombre}</Text><Text style={styles.friendActivity}>En línea</Text></View>
                    <TouchableOpacity onPress={() => eliminarAmigo(amigo.id, amigo.nombre)}><Ionicons name="trash-outline" size={20} color="#e74c3c" /></TouchableOpacity>
                  </View>
                ))}

                {amigosOffline.length > 0 && <Text style={styles.socialSectionTitle}>DESCONECTADOS</Text>}
                {amigosOffline.map((amigo) => (
                  <View key={amigo.id} style={styles.friendItem}>
                    <Image source={{ uri: amigo.avatar }} style={styles.friendAvatar} />
                    <View style={styles.friendInfo}><Text style={styles.friendName}>{amigo.nombre}</Text></View>
                    <TouchableOpacity onPress={() => eliminarAmigo(amigo.id, amigo.nombre)}><Ionicons name="trash-outline" size={20} color="#e74c3c" /></TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.addFriendButton} onPress={() => setModalAñadirVisible(true)}><Text style={styles.addFriendButtonText}>Añadir amigo</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* MODAL AÑADIR AMIGO */}
        <Modal visible={modalAñadirVisible} transparent animationType="fade">
          <View style={styles.formModalOverlay}>
            <View style={styles.formBox}>
              <Text style={styles.formModalTitle}>Nuevo amigo</Text>
              <TextInput style={styles.formInput} placeholder="Nombre de usuario" value={nuevoAmigoNombre} onChangeText={setNuevoAmigoNombre} />
              <View style={styles.formModalButtons}>
                <TouchableOpacity style={styles.formCancelButton} onPress={() => setModalAñadirVisible(false)}><Text style={styles.formButtonText}>Cerrar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.formSaveButton} onPress={añadirAmigo}><Text style={styles.formButtonText}>Enviar</Text></TouchableOpacity>
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
  header: { zIndex: 20, elevation: 20, backgroundColor: 'rgba(10, 25, 40, 0.95)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FCEEB5' },
  headerTitleContainer: { flex: 1, height: 50, marginRight: 10 },
  headerIcons: { flexDirection: 'row', gap: 5 }, 
  scrollContent: { padding: 20, gap: 20, paddingBottom: 50 },
  accordionButton: { backgroundColor: '#FCEEB5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 12, elevation: 4 },
  accordionText: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  cardsGridContainer: { backgroundColor: 'rgba(238, 242, 245, 0.95)', borderRadius: 15, padding: 15, marginTop: -10 },
  collectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  cardShadowWrapper: { width: '30%', aspectRatio: 0.65, elevation: 5, marginBottom: 10 },
  cardInner: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  cardImageAbsolute: { position: 'absolute', width: '100%', height: '100%' },
  lockedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  unlockedOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8 },
  cardText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  communityPanel: { backgroundColor: 'rgba(238, 242, 245, 0.95)', borderRadius: 15, padding: 15, elevation: 8 },
  communityTitle: { fontSize: 18, color: '#2c3e50', marginBottom: 15 },
  communityImageContainer: { width: '100%', aspectRatio: 0.75, borderRadius: 15, overflow: 'hidden', marginBottom: 15 },
  communityImage: { width: '100%', height: '100%' },
  communitySubtitle: { fontSize: 16, color: '#2c3e50', textAlign: 'center', marginBottom: 15 },
  communityFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voteControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voteButton: { backgroundColor: '#2c3e50', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  voteButtonActiveUp: { backgroundColor: '#2ecc71' },
  voteButtonActiveDown: { backgroundColor: '#e74c3c' },
  voteBadge: { backgroundColor: '#2c3e50', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  voteBadgeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  starsContainer: { flexDirection: 'row', gap: 2 },
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
  searchButton: { backgroundColor: '#A8C8C0', paddingVertical: 18, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 8, marginTop: 10 },
  searchButtonActive: { backgroundColor: '#6c8b84' },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchButtonText: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', letterSpacing: 1 },
  searchButtonTextActive: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#EEF2F5', borderRadius: 15, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  modalOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalOptionText: { fontSize: 16, color: '#2c3e50', textAlign: 'center' },
  socialOverlayAbsolute: { position: 'absolute', top: 71, bottom: 0, left: 0, right: 0, flexDirection: 'row', zIndex: 10 },
  socialModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  socialPanel: { width: '85%', backgroundColor: 'rgba(10, 25, 40, 0.95)', borderLeftWidth: 1, borderLeftColor: '#FCEEB5' },
  socialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(252, 238, 181, 0.3)' },
  socialTitle: { fontSize: 20, color: '#FCEEB5', fontWeight: 'bold' },
  searchInput: { flex: 1, color: '#FCEEB5', fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#8caea6', marginHorizontal: 10 },
  socialScrollContent: { padding: 20, paddingBottom: 40 },
  socialSectionTitle: { color: '#8caea6', fontSize: 14, fontWeight: 'bold', marginBottom: 15, marginTop: 15 },
  friendItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 12, marginBottom: 10 },
  friendAvatar: { width: 45, height: 45, borderRadius: 22, marginRight: 15 },
  friendInfo: { flex: 1 },
  friendName: { color: '#FCEEB5', fontSize: 16, fontWeight: 'bold' },
  friendActivity: { color: '#8caea6', fontSize: 12 },
  addFriendButton: { backgroundColor: '#A8C8C0', margin: 20, paddingVertical: 15, borderRadius: 30, alignItems: 'center' },
  addFriendButtonText: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  modeBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(10, 25, 40, 0.85)', borderWidth: 1, paddingVertical: 8, borderRadius: 20, alignSelf: 'center', paddingHorizontal: 20 },
  modeBannerText: { fontWeight: 'bold', fontSize: 13 },
  formModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  formBox: { width: '85%', backgroundColor: '#EEF2F5', padding: 25, borderRadius: 15 },
  formModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20, textAlign: 'center' },
  formInput: { width: '100%', backgroundColor: '#FCEEB5', padding: 12, borderRadius: 10, fontSize: 16, marginBottom: 20 },
  formModalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  formCancelButton: { backgroundColor: '#FF6B6B', padding: 12, borderRadius: 10, width: '48%', alignItems: 'center' },
  formSaveButton: { backgroundColor: '#A8C8C0', padding: 12, borderRadius: 10, width: '48%', alignItems: 'center' },
  formButtonText: { color: 'white', fontWeight: 'bold' },
});