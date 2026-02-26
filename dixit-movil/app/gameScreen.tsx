import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  TextInput,
  Modal,
  Dimensions,
  ImageBackground,
} from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get('window');

type CardData = { id: string; image: string };

type CardProps = {
  card: CardData;
  selected: boolean;
  cardWidth: number;
  onSelect: () => void;
  onConfirm: () => void;
  showConfirm: boolean;
};

function Card({ card, selected, cardWidth, onSelect, onConfirm, showConfirm }: CardProps) {
  return (
    <View style={[styles.cardWrapper, { width: cardWidth }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onSelect}
        style={[
          styles.card,
          { width: cardWidth },
          selected && styles.cardSelected,
        ]}
      >
        <Image source={{ uri: card.image }} style={styles.cardImage} />
      </TouchableOpacity>

      {selected && showConfirm && (
        <TouchableOpacity style={styles.chooseButton} onPress={onConfirm}>
          <Text style={styles.chooseText}>Elegir</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function GameScreen() {
  const router = useRouter();

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [isNarrator, setIsNarrator] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [mapExpanded, setMapExpanded] = useState(false);

  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const cards: CardData[] = useMemo(
    () => [
      { id: '1', image: 'https://picsum.photos/300/400?1' },
      { id: '2', image: 'https://picsum.photos/300/400?2' },
      { id: '3', image: 'https://picsum.photos/300/400?3' },
      { id: '4', image: 'https://picsum.photos/300/400?4' },
      { id: '5', image: 'https://picsum.photos/300/400?5' },
    ],
    []
  );

  const bottomRow = cards.slice(0, 3);
  const topRow = cards.slice(3, 5);

  const cardWidth = Math.floor((width - 40 - 2 * 12) / 3);

  const handleConfirm = () => {
    if (!selectedCard) return;
    if (isNarrator) console.log(selectedCard, phrase);
    else console.log(selectedCard);
  };

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
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/store')}>
              <Ionicons name="cart-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
            <TouchableOpacity style={{ padding: 5 }} onPress={() => router.push('/setting')}>
              <Ionicons name="settings-outline" size={26} color="#FCEEB5" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.gameContent}>

          <View style={styles.topSection}>
            {!isNarrator ? (
              <Text style={styles.phraseText}>Donde nacen las sombras</Text>
            ) : (
              selectedCard && (
                <View style={styles.narratorContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Escribe tu frase..."
                    placeholderTextColor="#6b6b6b"
                    value={phrase}
                    onChangeText={setPhrase}
                  />
                  <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                    <Text style={styles.confirmText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>

          <View style={styles.boardContainer}>
            <TouchableOpacity
              style={styles.boardPreview}
              activeOpacity={0.9}
              onPress={() => setMapExpanded(true)}
            />
          </View>

          <View style={styles.cardsContainer}>
            <View style={styles.topRow}>
              {topRow.map((card) => (
                <View key={card.id} style={{ marginHorizontal: 6 }}>
                  <Card
                    card={card}
                    selected={selectedCard === card.id}
                    cardWidth={cardWidth}
                    onSelect={() => setSelectedCard(card.id)}
                    onConfirm={handleConfirm}
                    showConfirm={!isNarrator}
                  />
                </View>
              ))}
            </View>

            <View style={styles.bottomRow}>
              {bottomRow.map((card) => (
                <View key={card.id} style={{ marginHorizontal: 6 }}>
                  <Card
                    card={card}
                    selected={selectedCard === card.id}
                    cardWidth={cardWidth}
                    onSelect={() => setSelectedCard(card.id)}
                    onConfirm={handleConfirm}
                    showConfirm={!isNarrator}
                  />
                </View>
              ))}
            </View>
          </View>

        </View>

        <Modal visible={mapExpanded} animationType="fade" transparent>
          <View style={styles.mapOverlay}>
            <View style={styles.mapModal}>
              <TouchableOpacity onPress={() => setMapExpanded(false)}>
                <Ionicons name="close" size={34} color="#FCEEB5" />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },

  safeArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },

  header: {
    backgroundColor: 'rgba(10, 25, 40, 0.95)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCEEB5',
  },

  headerTitleContainer: {
    flex: 1,
    height: 50,
    marginRight: 10,
  },

  headerIcons: {
    flexDirection: 'row',
    gap: 5,
  },

  gameContent: {
    flex: 1,
  },

  topSection: {
    paddingHorizontal: 20,
    paddingTop: 15,
  },

  phraseText: {
    fontSize: 26,
    textAlign: 'center',
    color: '#FCEEB5',
    fontFamily: 'FuenteTitulo',
  },

  narratorContainer: {
    gap: 12,
  },

  input: {
    width: '100%',
    backgroundColor: '#FCEEB5',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4c494',
    fontSize: 16,
  },

  confirmButton: {
    alignSelf: 'center',
    backgroundColor: '#A8C8C0',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#8caea6',
  },

  confirmText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },

  boardContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },

  boardPreview: {
    width: '100%',
    height: '85%',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FCEEB5',
    backgroundColor: 'rgba(10, 25, 40, 0.9)',
  },

  cardsContainer: {
    paddingBottom: 30,
    paddingTop: 10,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 15,
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },

  cardWrapper: {
    alignItems: 'center',
  },

  card: {
    aspectRatio: 0.65,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },

  cardSelected: {
    borderColor: '#FCEEB5',
  },

  cardImage: {
    width: '100%',
    height: '100%',
  },

  chooseButton: {
    position: 'absolute',
    bottom: 10,
    backgroundColor: '#FCEEB5',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
  },

  chooseText: {
    fontWeight: 'bold',
    color: '#2c3e50',
  },

  mapOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  mapModal: {
    width: '90%',
    height: '80%',
    backgroundColor: 'rgba(10, 25, 40, 0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FCEEB5',
  },
});