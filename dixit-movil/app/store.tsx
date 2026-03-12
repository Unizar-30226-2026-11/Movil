import {
  StyleSheet,
  Text,
  View,
  ImageBackground,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Modal,
  Alert
} from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://10.1.65.221:3000/api';

SplashScreen.preventAutoHideAsync();

export default function StoreScreen() {
  const [loaded, error] = useFonts({
    'FuenteTitulo': require('../assets/fonts/fuente-dilana.ttf'),
  });

  const [imagenSeleccionada, setImagenSeleccionada] = useState<string | null>(null);
  const [modalCompraVisible, setModalCompraVisible] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
    fetchShopItems();
    fetchBalance();
  }, [loaded, error]);

  const fetchShopItems = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const timestamp = new Date().getTime(); // Truco anti-caché también para la tienda

      const response = await fetch(`${API_URL}/shop/items?t=${timestamp}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

      const data = await response.json();
      
      if (data.items) {
        setProductos(data.items);
      }

    } catch (error) {
      console.log("Error cargando tienda:", error);
    }
  };

  if (!loaded && !error) return null;

  const abrirCompra = (producto: any) => {
    setProductoSeleccionado(producto);
    setModalCompraVisible(true);
  };

  const comprarProducto = async () => {
    // PROTECCIÓN FRONTEND: Comprobamos si el precio es mayor que las monedas que tenemos
    if (productoSeleccionado.price > coins) {
      Alert.alert("Saldo insuficiente", "No tienes suficientes monedas para comprar este artículo.");
      setModalCompraVisible(false);
      return; 
    }

    try {
      const token = await AsyncStorage.getItem("userToken");

      const response = await fetch(`${API_URL}/shop/buy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          itemId: productoSeleccionado.id
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Refrescamos el balance para ver el nuevo saldo inmediatamente
        await fetchBalance(); 
        Alert.alert("¡Enhorabuena!", "Compra realizada con éxito.");
      } else {
        Alert.alert("Error", data.message || "No se pudo completar la compra.");
      }

    } catch (error) {
      console.log("Fallo al procesar la compra", error);
    } finally {
       setModalCompraVisible(false); // Cerramos el modal pase lo que pase
    }
  };


  const fetchBalance = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const timestamp = new Date().getTime(); // Nuestro querido Cache Buster

      const response = await fetch(`${API_URL}/users/balance?t=${timestamp}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

      const data = await response.json();

      // Mismo apaño que en menu.tsx para leer bien el JSON anidado
      if (data.balance && typeof data.balance.balance === 'number') {
        setCoins(data.balance.balance);
      } else if (typeof data.balance === 'number') {
        setCoins(data.balance);
      } else if (typeof data.coins === 'number') {
        setCoins(data.coins);
      } else {
        setCoins(0);
      }

    } catch (error) {
      console.log("Error al refrescar las monedas:", error);
    }
  };


  return (
    <ImageBackground
      source={require('../assets/images/background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
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
            <View style={styles.coinsContainer}>
              <Text style={styles.coinsText}>{coins}</Text>
              <Ionicons name="cash" size={18} color="#FFD700" />
            </View>

            <TouchableOpacity onPress={() => router.replace('/menu')} style={{ padding: 5 }}>
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
                  onPress={() => {}}
                >
                  <View style={styles.cardImagePlaceholder}>
                    <Ionicons name="cube-outline" size={40} color="#2c3e50" />
                  </View>
                </TouchableOpacity>

                <Text style={styles.deckName}>{producto.name}</Text>
                <Text style={styles.deckDescription}>{producto.description}</Text>
                <View style={styles.cardFooter}>

                  <View style={styles.priceContainer}>
                    <Ionicons name="logo-bitcoin" size={16} color="#d4af37" />
                    <Text style={styles.priceText}>
                      {producto.price}
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
                ¿Estás seguro de que quieres comprar este artículo?
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
                  onPress={() => comprarProducto()}
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

  header: {
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'rgba(10, 25, 40, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCEEB5',
  },

  headerTitleContainer: { flex: 1, height: 40 },
  headerIcons: { flexDirection: 'row', gap: 5 },

  coinsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#FFD700',
    marginRight: 6,
  },

  coinsText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },

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

  cardImagePlaceholder: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 14,
    backgroundColor: '#dce8e3',
    justifyContent: 'center',
    alignItems: 'center',
  },

  deckDescription: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    marginTop: 4,
  },
});