import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

type WhackMoleDuelProps = {
  duration: number;
  onComplete: (score: number) => void;
};

function MoleIllustration({ active }: { active: boolean }) {
  return (
    <Svg width={58} height={58} viewBox="0 0 58 58">
      <Ellipse cx="29" cy={active ? 34 : 42} rx="18" ry="13" fill="#4a352e" opacity={active ? 1 : 0.2} />
      <Circle cx="29" cy={active ? 23 : 34} r="15" fill="#675047" opacity={active ? 1 : 0.24} />
      <Ellipse cx="20" cy={active ? 14 : 26} rx="5" ry="7" fill="#7f655b" opacity={active ? 1 : 0.2} />
      <Ellipse cx="38" cy={active ? 14 : 26} rx="5" ry="7" fill="#7f655b" opacity={active ? 1 : 0.2} />
      <Circle cx="24" cy={active ? 21 : 31} r="2.2" fill="#111" opacity={active ? 1 : 0.3} />
      <Circle cx="34" cy={active ? 21 : 31} r="2.2" fill="#111" opacity={active ? 1 : 0.3} />
      <Ellipse cx="29" cy={active ? 28 : 37} rx="8.5" ry="6.5" fill="#e5b0b6" opacity={active ? 1 : 0.24} />
      <Circle cx="27" cy={active ? 27 : 36} r="1.4" fill="#5e4040" opacity={active ? 1 : 0.24} />
      <Circle cx="31" cy={active ? 27 : 36} r="1.4" fill="#5e4040" opacity={active ? 1 : 0.24} />
      <Path d={active ? 'M22 32 Q29 36 36 32' : 'M22 39 Q29 41 36 39'} stroke="#3a2620" strokeWidth="1.6" fill="none" opacity={active ? 1 : 0.24} />
      <Path d={active ? 'M19 37 L14 42' : 'M19 42 L16 45'} stroke="#d6b38f" strokeWidth="2.4" strokeLinecap="round" opacity={active ? 1 : 0.15} />
      <Path d={active ? 'M39 37 L44 42' : 'M39 42 L42 45'} stroke="#d6b38f" strokeWidth="2.4" strokeLinecap="round" opacity={active ? 1 : 0.15} />
    </Svg>
  );
}

export function WhackMoleDuel({ duration, onComplete }: WhackMoleDuelProps) {
  const [score, setScore] = useState(0);
  const [remaining, setRemaining] = useState(duration);
  const [activeMole, setActiveMole] = useState<number | null>(null);
  const scoreRef = useRef(0);
  const finishedRef = useRef(false);

  const cells = useMemo(() => Array.from({ length: 9 }, (_, index) => index), []);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    finishedRef.current = false;
    const moleInterval = setInterval(() => {
      setActiveMole(Math.floor(Math.random() * 9));
    }, 480);

    const timerInterval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          clearInterval(moleInterval);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(moleInterval);
    };
  }, [onComplete]);

  useEffect(() => {
    if (remaining !== 0 || finishedRef.current) return;
    finishedRef.current = true;
    onComplete(scoreRef.current);
  }, [onComplete, remaining]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Golpea topos</Text>
      <Text style={styles.caption}>Tiempo: {remaining}s · Puntos: {score}</Text>
      <ImageBackground source={require('../../assets/images/minigames/mole-grass.jpg')} style={styles.gardenPanel} imageStyle={styles.gardenPanelImage}>
        <View style={styles.gardenOverlay} />
        <View style={styles.grid}>
          {cells.map((cell) => {
            const isActive = activeMole === cell;

            return (
              <TouchableOpacity
                key={cell}
                style={styles.cell}
                onPress={() => {
                  if (!isActive) return;
                  setScore((prev) => prev + 1);
                  setActiveMole(null);
                }}
              >
                <View style={styles.holeShadow} />
                <View style={styles.hole}>
                  <MoleIllustration active={isActive} />
                </View>
                {isActive ? <Text style={styles.hitHint}>golpea</Text> : null}
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
  gardenPanel: {
    borderRadius: 24,
    minHeight: 330,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
    position: 'relative',
    overflow: 'hidden',
  },
  gardenPanelImage: {
    borderRadius: 24,
  },
  gardenOverlay: {
    position: 'absolute',
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 24, 14, 0.34)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  cell: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.12)',
    position: 'relative',
    overflow: 'hidden',
  },
  holeShadow: {
    position: 'absolute',
    bottom: 14,
    width: 64,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  hole: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6d4c41',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#9c6d59',
    paddingTop: 4,
  },
  hitHint: {
    position: 'absolute',
    bottom: 6,
    color: '#FCEEB5',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
