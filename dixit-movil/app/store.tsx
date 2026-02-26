import {
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Modal
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function StoreScreen() {
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [modalCompraVisible, setModalCompraVisible] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<any>(null);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const productos = [
    {
      id: '1',
      nombre: 'Mazo Onírico',
      precio: 600,
      imagen: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: '2',
      nombre: 'Mazo Fantasía',
      precio: 900,
      imagen: 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: '3',
      nombre: 'Mazo Surreal',
      precio: 500,
      imagen: 'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=900&q=80',
    },
  ];

  const abrirCompra = (producto: any) => {
    setProductoSeleccionado(producto);
    setModalCompraVisible(true);
  };

  return (
    <ImageBackground
      source={require('../assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>

        {/* CABECERA ACTUALIZADA CON BOTÓN DE ATRÁS */}
        <View style={styles.header}>
          
          {/* BOTÓN ATRÁS (Añadido aquí) */}
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 5, marginRight: 5 }}>
            <Ionicons name="arrow-back" size={28} color="#FCEEB5" />
          </TouchableOpacity>

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
            {/* Se mantiene el botón de home que ya tenía tu compañero */}
            <TouchableOpacity onPress={() => router.push('/menu')} style={{ padding: 5 }}>
              <Ionicons name="home-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/profile')} style={{ padding: 5 }}>
              <Ionicons name="person-circle-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/setting')} style={{ padding: 5 }}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.grid}>
            {productos.map((producto) => (
              <View key={producto.id} style={styles.cardContainer}>
                
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setImagenSeleccionada(producto.imagen)}
                >
                  <Image
                    source={{ uri: producto.imagen }}
                    style={styles.cardImage}
                  />
                </TouchableOpacity>

                <Text style={styles.deckName}>{producto.nombre}</Text>

                <View style={styles.cardFooter}>
                  
                <View style={styles.priceContainer}>
                  <Ionicons 
                    name="logo-bitcoin" 
                    size={16} 
                    color="#d4af37" 
                  />
                  <Text style={styles.priceText}>
                    {producto.precio}
                  </Text>
                </View>

                  <TouchableOpacity
                    style={styles.buyButton}
                    onPress={() => abrirCompra(producto)}
                  >
                    <Text style={styles.buyText}>Comprar</Text>
                  </TouchableOpacity>

                </View>

              </View>
            ))}
          </View>
        </ScrollView>

        <Modal visible={!!imagenSeleccionada} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setImagenSeleccionada(null)}
          >
            <Image
              source={{ uri: imagenSeleccionada || '' }}
              style={styles.fullImage}
            />
          </TouchableOpacity>
        </Modal>

        <Modal visible={modalCompraVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>
                ¿Estás seguro de que quieres comprar este mazo?
              </Text>

              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.noButton}
                  onPress={() => setModalCompraVisible(false)}
                >
                  <Text style={styles.confirmButtonText}>No</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.yesButton}
                  onPress={() => {
                    setModalCompraVisible(false);
                    alert('Compra realizada');
                  }}
                >
                  <Text style={styles.confirmButtonText}>Sí</Text>
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
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' },

  // Añado zIndex y elevation para mantener la consistencia y que los botones no fallen
  header: {
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'rgba(10, 25, 40, 0.95)',
    flexDirection: 'row',
    alignItems: 'center', // Simplifico esto porque ahora hay botón a la izquierda y derecha
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCEEB5',
  },

  headerTitleContainer: { flex: 1, height: 40 }, // Ajuste de altura similar al resto de pantallas
  headerIcons: { flexDirection: 'row', gap: 5 },

  scrollContent: { padding: 20 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  cardContainer: {
    width: '47%',
    marginBottom: 30,
  },

  cardImage: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 14,
  },

  deckName: {
    marginTop: 8,
    fontWeight: '600',
    textAlign: 'center',
    color: '#2c3e50',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },

  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  priceText: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#2c3e50',
  },

  buyButton: {
    backgroundColor: '#dce8e3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A8C8C0',
  },

  buyText: {
    fontWeight: '600',
    color: '#2c3e50',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fullImage: {
    width: '85%',
    aspectRatio: 0.75,
    borderRadius: 18,
  },

  confirmBox: {
    width: '80%',
    backgroundColor: '#EEF2F5',
    padding: 20,
    borderRadius: 15,
  },

  confirmText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },

  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  noButton: {
    backgroundColor: '#FF6B6B',
    padding: 10,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },

  yesButton: {
    backgroundColor: '#6c8b84',
    padding: 10,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },

  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});