import { 
  StyleSheet, Text, View, ImageBackground, Image, 
  TouchableOpacity, ScrollView, SafeAreaView, Modal, ActivityIndicator 
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons'; 
import { router } from 'expo-router/build/exports';

SplashScreen.preventAutoHideAsync();

export default function MainScreen() {
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'), 
  });

  const [cartasDesplegadas, setCartasDesplegadas] = useState(false);
  const [mapaSeleccionado, setMapaSeleccionado] = useState('Selección Mapa');
  const [mazoSeleccionado, setMazoSeleccionado] = useState('Selección Mazo');
  const [modalVisible, setModalVisible] = useState(false);
  const [tipoModal, setTipoModal] = useState(''); 
  
  // --- NUEVO ESTADO: Controla si estamos buscando partida ---
  const [buscando, setBuscando] = useState(false);

  const coleccionSurrealista = [
    { id: '1', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=400&q=80' },
    { id: '2', bloqueada: false, nombre: 'Ojo', imagen: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=400&q=80' },
    { id: '3', bloqueada: false, nombre: 'Pájaros', imagen: 'https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?auto=format&fit=crop&w=400&q=80' },
    { id: '4', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80' },
    { id: '5', bloqueada: false, nombre: 'Desierto', imagen: 'https://images.unsplash.com/photo-1506159904225-f82b7b69cd5b?auto=format&fit=crop&w=400&q=80' },
    { id: '6', bloqueada: true, imagen: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=400&q=80' },
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

  // --- NUEVA FUNCIÓN: Simular la búsqueda ---
  const iniciarBusqueda = () => {
    // 1. Encendemos la animación
    setBuscando(true);

    // 2. Esperamos 3 segundos (3000 milisegundos)
    setTimeout(() => {
      // 3. Apagamos la animación
      setBuscando(false);
      // 4. Avisamos de que lo ha encontrado (luego aquí navegaremos a la pantalla de juego)
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
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="28" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity><Ionicons name="cart-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity><Ionicons name="people-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity><Ionicons name="person-circle-outline" size={26} color="#FCEEB5" /></TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

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
            <TouchableOpacity style={styles.inviteButton}>
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

            {/* --- BOTÓN DE BUSCAR PARTIDA ACTUALIZADO --- */}
            <TouchableOpacity 
              // Si está buscando, le aplicamos un estilo extra para oscurecerlo
              style={[styles.searchButton, buscando && styles.searchButtonActive]}
              onPress={iniciarBusqueda}
              disabled={buscando} // Evita que el usuario pulse mil veces mientras busca
            >
              {buscando ? (
                // Si está buscando, mostramos la ruedecita y el texto "Buscando..."
                <View style={styles.searchingRow}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.searchButtonTextActive}>Buscando...</Text>
                </View>
              ) : (
                // Si NO está buscando, mostramos el botón normal
                <Text style={styles.searchButtonText}>Buscar partida</Text>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>

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

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  header: { backgroundColor: 'rgba(10, 25, 40, 0.95)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FCEEB5' },
  headerTitleContainer: { flex: 1, height: 50, marginRight: 10 },
  headerIcons: { flexDirection: 'row', gap: 15 },
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
  
  // --- ESTILOS DEL BOTÓN DE BÚSQUEDA ---
  searchButton: { 
    backgroundColor: '#A8C8C0', 
    paddingVertical: 18, 
    borderRadius: 30, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 4.65, 
    elevation: 8, 
    marginTop: 10 
  },
  searchButtonActive: {
    backgroundColor: '#6c8b84', // Se pone más oscuro cuando estás buscando
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // Espacio entre el círculo girando y el texto
  },
  searchButtonText: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#2c3e50', 
    letterSpacing: 1 
  },
  searchButtonTextActive: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#ffffff', // El texto pasa a blanco para contrastar
    letterSpacing: 1 
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#EEF2F5', borderRadius: 15, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 10 },
  modalOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  modalOptionText: { fontSize: 16, color: '#2c3e50', textAlign: 'center' },
  modalCloseButton: { marginTop: 15, backgroundColor: '#FF6B6B', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalCloseText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});