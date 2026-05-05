import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MemoryPairsDuelProps = {
  duration: number;
  onComplete: (score: number) => void;
};

type CardItem = {
  id: number;
  value: string;
};

const BASE_VALUES = ['🍎', '🍐', '🍒', '🍊', '🍇', '🍉'];

export function MemoryPairsDuel({ duration, onComplete }: MemoryPairsDuelProps) {
  const deck = useMemo<CardItem[]>(
    () =>
      [...BASE_VALUES, ...BASE_VALUES]
        .map((value, index) => ({ id: index, value }))
        .sort(() => Math.random() - 0.5),
    []
  );
  const [remaining, setRemaining] = useState(duration);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [openedIds, setOpenedIds] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    finishedRef.current = false;
    const timerInterval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [onComplete]);

  useEffect(() => {
    if (remaining !== 0 || finishedRef.current) return;
    finishedRef.current = true;
    onComplete(scoreRef.current);
  }, [onComplete, remaining]);

  useEffect(() => {
    if (openedIds.length !== 2) return;

    const [first, second] = openedIds;
    const firstCard = deck.find((card) => card.id === first);
    const secondCard = deck.find((card) => card.id === second);

    if (firstCard?.value === secondCard?.value) {
      setMatchedIds((prev) => [...prev, first, second]);
      setScore((prev) => prev + 2);
      setOpenedIds([]);
      return;
    }

    const timeout = setTimeout(() => {
      setOpenedIds([]);
    }, 650);

    return () => clearTimeout(timeout);
  }, [deck, openedIds]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Memoria frutal</Text>
      <Text style={styles.caption}>Tiempo: {remaining}s · Parejas: {matchedIds.length / 2}</Text>
      <ImageBackground source={require('../../assets/images/minigames/memory-night-sky.jpg')} style={styles.skyPanel} imageStyle={styles.skyPanelImage}>
        <View style={styles.skyOverlay} />
        <View style={styles.grid}>
          {deck.map((card) => {
            const isOpen = openedIds.includes(card.id) || matchedIds.includes(card.id);

            return (
              <TouchableOpacity
                key={card.id}
                style={[styles.card, isOpen && styles.cardOpen, matchedIds.includes(card.id) && styles.cardMatched]}
                disabled={isOpen || openedIds.length === 2}
                onPress={() => setOpenedIds((prev) => [...prev, card.id])}
              >
                <View style={styles.cardFace}>
                  <Text style={[styles.cardText, !isOpen && styles.cardTextHidden]}>
                    {isOpen ? card.value : '✦'}
                  </Text>
                  {!isOpen ? <Text style={styles.cardBackLabel}>fruta</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  title: {
    color: '#FCEEB5',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  caption: {
    color: '#d7dce2',
    textAlign: 'center',
  },
  skyPanel: {
    minHeight: 350,
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
    overflow: 'hidden',
    position: 'relative',
  },
  skyPanelImage: {
    borderRadius: 24,
  },
  skyOverlay: {
    position: 'absolute',
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 20, 35, 0.42)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  card: {
    width: 74,
    height: 92,
    borderRadius: 18,
    backgroundColor: 'rgba(24, 44, 72, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.28)',
    overflow: 'hidden',
  },
  cardOpen: {
    backgroundColor: 'rgba(244, 239, 224, 0.94)',
  },
  cardMatched: {
    borderColor: '#A8C8C0',
    backgroundColor: 'rgba(220, 232, 227, 0.94)',
  },
  cardFace: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  cardText: {
    color: '#10212e',
    fontSize: 30,
    fontWeight: 'bold',
  },
  cardTextHidden: {
    color: '#FCEEB5',
    fontSize: 24,
  },
  cardBackLabel: {
    color: '#d7dce2',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
