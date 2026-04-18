import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

type FruitBasketDuelProps = {
  duration: number;
  onComplete: (score: number) => void;
};

type FallingItem = {
  id: number;
  x: number;
  y: number;
  speed: number;
  kind: 'apple' | 'bomb';
};

const ITEM_SIZE = 46;
const BASKET_WIDTH = 94;
const BASKET_HEIGHT = 52;

function FallingVisual({ kind }: { kind: FallingItem['kind'] }) {
  if (kind === 'bomb') {
    return (
      <Svg width={42} height={42} viewBox="0 0 42 42">
        <Circle cx="21" cy="24" r="11" fill="#374151" />
        <Circle cx="26" cy="18" r="4" fill="#4b5563" />
        <Path d="M27 15 C29 12, 32 11, 34 12" stroke="#FCEEB5" strokeWidth="2" fill="none" strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={42} height={42} viewBox="0 0 42 42">
      <Circle cx="21" cy="22" r="12" fill="#c7423d" />
      <Ellipse cx="17" cy="18" rx="3.5" ry="4.8" fill="#d35d55" opacity="0.45" />
      <Rect x="19.2" y="7" width="3" height="8" rx="1.5" fill="#6b4b35" />
      <Path d="M22 10 C27 6, 31 8, 31 12 C28 14, 24 14, 22 10" fill="#5f8f48" />
    </Svg>
  );
}

function BasketIllustration() {
  return (
    <Svg width={66} height={42} viewBox="0 0 66 42">
      <Path d="M18 11 C22 3, 44 3, 48 11" stroke="#d9c08f" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M10 13 L56 13 L52 33 C51 37, 48 39, 44 39 L22 39 C18 39, 15 37, 14 33 Z" fill="#8e6238" />
      <Path d="M14 18 H52" stroke="#b98552" strokeWidth="2" opacity="0.7" />
      <Path d="M17 24 H49" stroke="#b98552" strokeWidth="2" opacity="0.7" />
      <Path d="M21 13 V38" stroke="#c89d63" strokeWidth="2" opacity="0.7" />
      <Path d="M33 13 V39" stroke="#c89d63" strokeWidth="2" opacity="0.7" />
      <Path d="M45 13 V38" stroke="#c89d63" strokeWidth="2" opacity="0.7" />
    </Svg>
  );
}

export function FruitBasketDuel({ duration, onComplete }: FruitBasketDuelProps) {
  const [remaining, setRemaining] = useState(duration);
  const [score, setScore] = useState(0);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [playfieldHeight, setPlayfieldHeight] = useState(360);
  const [playfieldWidth, setPlayfieldWidth] = useState(300);
  const [basketX, setBasketX] = useState(103);
  const [combo, setCombo] = useState(0);
  const [lastEventText, setLastEventText] = useState('Recoge manzanas y esquiva bombas');
  const itemIdRef = useRef(0);
  const scoreRef = useRef(0);
  const basketXRef = useRef(103);
  const comboRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    basketXRef.current = basketX;
  }, [basketX]);

  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);

  useEffect(() => {
    finishedRef.current = false;
    setRemaining(duration);
    setScore(0);
    setCombo(0);
    setItems([]);
    setLastEventText('Recoge manzanas y esquiva bombas');
    scoreRef.current = 0;
    comboRef.current = 0;
    const initialBasketX = Math.max(18, playfieldWidth / 2 - BASKET_WIDTH / 2);
    setBasketX(initialBasketX);
    basketXRef.current = initialBasketX;

    const spawnInterval = setInterval(() => {
      const nextKind: FallingItem['kind'] = Math.random() < 0.8 ? 'apple' : 'bomb';
      const maxX = Math.max(24, playfieldWidth - ITEM_SIZE - 20);

      setItems((prev) => [
        ...prev,
        {
          id: itemIdRef.current++,
          x: 12 + Math.random() * maxX,
          y: -36,
          speed: 8 + Math.random() * 5,
          kind: nextKind,
        },
      ]);
    }, 360);

    const movementInterval = setInterval(() => {
      setItems((prev) =>
        prev
          .map((item) => ({ ...item, y: item.y + item.speed }))
          .filter((item) => {
            const itemCenter = item.x + ITEM_SIZE / 2;
            const basketCenter = basketXRef.current + BASKET_WIDTH / 2;
            const caught =
              item.y >= playfieldHeight - 92 &&
              Math.abs(itemCenter - basketCenter) <= BASKET_WIDTH / 2;

            if (caught) {
              if (item.kind === 'bomb') {
                setCombo(0);
                comboRef.current = 0;
                setLastEventText('Bomba atrapada');
                setScore((prevScore) => {
                  const nextScore = Math.max(0, prevScore - 4);
                  scoreRef.current = nextScore;
                  return nextScore;
                });
              } else {
                const comboBonus = comboRef.current >= 3 ? 1 : 0;
                setCombo((prevCombo) => prevCombo + 1);
                comboRef.current += 1;
                setLastEventText(comboBonus > 0 ? 'Combo de manzanas' : 'Buen reflejo');
                setScore((prevScore) => {
                  const nextScore = prevScore + 1 + comboBonus;
                  scoreRef.current = nextScore;
                  return nextScore;
                });
              }
              return false;
            }

            if (item.y > playfieldHeight + 20) {
              if (item.kind !== 'bomb') {
                setCombo(0);
                comboRef.current = 0;
              }
              return false;
            }

            return true;
          })
      );
    }, 45);

    const timerInterval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(spawnInterval);
          clearInterval(movementInterval);
          clearInterval(timerInterval);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(spawnInterval);
      clearInterval(movementInterval);
      clearInterval(timerInterval);
    };
  }, [duration, onComplete, playfieldHeight, playfieldWidth]);

  useEffect(() => {
    if (remaining !== 0 || finishedRef.current) return;
    finishedRef.current = true;
    onComplete(scoreRef.current);
  }, [onComplete, remaining]);

  const updateBasketFromX = useCallback(
    (locationX: number) => {
      if (!playfieldWidth) return;
      const nextX = Math.max(8, Math.min(locationX - BASKET_WIDTH / 2, playfieldWidth - BASKET_WIDTH - 8));
      setBasketX(nextX);
    },
    [playfieldWidth]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => updateBasketFromX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateBasketFromX(event.nativeEvent.locationX),
      }),
    [updateBasketFromX]
  );

  const onLayout = (event: LayoutChangeEvent) => {
    setPlayfieldHeight(event.nativeEvent.layout.height);
    setPlayfieldWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Lluvia de frutas</Text>
      <Text style={styles.caption}>Tiempo: {remaining}s · Puntos: {score} · Combo: {combo}</Text>
      <Text style={styles.helper}>Desliza la cesta de lado a lado y encadena manzanas.</Text>

      <ImageBackground
        source={require('../../assets/images/minigames/orchard-apples.jpg')}
        style={styles.playfield}
        imageStyle={styles.playfieldImage}
      >
        <View style={styles.playfieldOverlay} onLayout={onLayout} {...panResponder.panHandlers}>
          <View style={styles.feedbackPill} pointerEvents="none">
            <Text style={styles.feedbackText}>{lastEventText}</Text>
          </View>

          {items.map((item) => (
            <View
              key={item.id}
              pointerEvents="none"
              style={[
                styles.item,
                {
                  top: item.y,
                  left: item.x,
                },
              ]}
            >
              <FallingVisual kind={item.kind} />
            </View>
          ))}

          <View style={[styles.basket, { left: basketX }]} pointerEvents="none">
            <BasketIllustration />
          </View>
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
  helper: {
    color: '#a0b0b9',
    textAlign: 'center',
    fontSize: 12,
  },
  playfield: {
    height: 360,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.24)',
  },
  playfieldImage: {
    borderRadius: 28,
  },
  playfieldOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 18, 14, 0.28)',
    position: 'relative',
  },
  feedbackPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 19, 29, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
    zIndex: 3,
  },
  feedbackText: {
    color: '#FCEEB5',
    fontSize: 12,
    fontWeight: 'bold',
  },
  item: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  basket: {
    position: 'absolute',
    bottom: 24,
    width: BASKET_WIDTH,
    height: BASKET_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
