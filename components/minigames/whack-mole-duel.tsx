import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

type WhackMoleDuelProps = {
  duration: number;
  onComplete: (score: number) => void;
};

type ActiveMole = {
  cell: number;
  kind: 'normal' | 'golden';
};

const GOLDEN_MOLE_CHANCE = 0.16;
const NORMAL_MOLE_POINTS = 1;
const GOLDEN_MOLE_POINTS = 3;

function MoleIllustration({ active, golden }: { active: boolean; golden: boolean }) {
  const bodyColor = golden ? '#d8a82f' : '#675047';
  const earColor = golden ? '#f2c94c' : '#7f655b';
  const bellyColor = golden ? '#fff0a8' : '#e5b0b6';
  const outlineColor = golden ? '#7d5512' : '#3a2620';

  return (
    <Svg width={58} height={58} viewBox="0 0 58 58">
      <Ellipse cx="29" cy={active ? 34 : 42} rx="18" ry="13" fill={golden ? '#8c6719' : '#4a352e'} opacity={active ? 1 : 0.2} />
      <Circle cx="29" cy={active ? 23 : 34} r="15" fill={bodyColor} opacity={active ? 1 : 0.24} />
      <Ellipse cx="20" cy={active ? 14 : 26} rx="5" ry="7" fill={earColor} opacity={active ? 1 : 0.2} />
      <Ellipse cx="38" cy={active ? 14 : 26} rx="5" ry="7" fill={earColor} opacity={active ? 1 : 0.2} />
      <Circle cx="24" cy={active ? 21 : 31} r="2.2" fill="#111" opacity={active ? 1 : 0.3} />
      <Circle cx="34" cy={active ? 21 : 31} r="2.2" fill="#111" opacity={active ? 1 : 0.3} />
      <Ellipse cx="29" cy={active ? 28 : 37} rx="8.5" ry="6.5" fill={bellyColor} opacity={active ? 1 : 0.24} />
      <Circle cx="27" cy={active ? 27 : 36} r="1.4" fill={outlineColor} opacity={active ? 1 : 0.24} />
      <Circle cx="31" cy={active ? 27 : 36} r="1.4" fill={outlineColor} opacity={active ? 1 : 0.24} />
      <Path d={active ? 'M22 32 Q29 36 36 32' : 'M22 39 Q29 41 36 39'} stroke={outlineColor} strokeWidth="1.6" fill="none" opacity={active ? 1 : 0.24} />
      <Path d={active ? 'M19 37 L14 42' : 'M19 42 L16 45'} stroke={golden ? '#fff0a8' : '#d6b38f'} strokeWidth="2.4" strokeLinecap="round" opacity={active ? 1 : 0.15} />
      <Path d={active ? 'M39 37 L44 42' : 'M39 42 L42 45'} stroke={golden ? '#fff0a8' : '#d6b38f'} strokeWidth="2.4" strokeLinecap="round" opacity={active ? 1 : 0.15} />
      {golden && active ? <Circle cx="43" cy="10" r="4" fill="#fff4b8" opacity="0.88" /> : null}
    </Svg>
  );
}

export function WhackMoleDuel({ duration, onComplete }: WhackMoleDuelProps) {
  const [score, setScore] = useState(0);
  const [remaining, setRemaining] = useState(duration);
  const [activeMole, setActiveMole] = useState<ActiveMole | null>(null);
  const [lastHitText, setLastHitText] = useState('Golpea los topos. El dorado vale x3.');
  const scoreRef = useRef(0);
  const finishedRef = useRef(false);

  const cells = useMemo(() => Array.from({ length: 9 }, (_, index) => index), []);

  useEffect(() => {
    finishedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setRemaining(duration);
    setActiveMole(null);
    setLastHitText('Golpea los topos. El dorado vale x3.');

    const moleInterval = setInterval(() => {
      setActiveMole({
        cell: Math.floor(Math.random() * 9),
        kind: Math.random() < GOLDEN_MOLE_CHANCE ? 'golden' : 'normal',
      });
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
  }, [duration]);

  useEffect(() => {
    if (remaining !== 0 || finishedRef.current) return;
    finishedRef.current = true;
    onComplete(scoreRef.current);
  }, [onComplete, remaining]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Golpea topos</Text>
      <Text style={styles.caption}>Tiempo: {remaining}s · Puntos: {score}</Text>
      <Text style={styles.helper}>{lastHitText}</Text>
      <ImageBackground source={require('../../assets/images/minigames/mole-grass.jpg')} style={styles.gardenPanel} imageStyle={styles.gardenPanelImage}>
        <View style={styles.gardenOverlay} />
        <View style={styles.grid}>
          {cells.map((cell) => {
            const isActive = activeMole?.cell === cell;
            const isGolden = isActive && activeMole?.kind === 'golden';

            return (
              <TouchableOpacity
                key={cell}
                style={[styles.cell, isGolden && styles.goldenCell]}
                onPress={() => {
                  if (!isActive) return;

                  const points = activeMole.kind === 'golden' ? GOLDEN_MOLE_POINTS : NORMAL_MOLE_POINTS;
                  setScore((prev) => {
                    const nextScore = prev + points;
                    scoreRef.current = nextScore;
                    return nextScore;
                  });
                  setLastHitText(activeMole.kind === 'golden' ? '+3 topo dorado' : '+1 buen golpe');
                  setActiveMole(null);
                }}
              >
                <View style={styles.holeShadow} />
                <View style={[styles.hole, isGolden && styles.goldenHole]}>
                  <MoleIllustration active={isActive} golden={isGolden} />
                </View>
                {isActive ? <Text style={[styles.hitHint, isGolden && styles.goldenHitHint]}>{isGolden ? '+3' : 'golpea'}</Text> : null}
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
  helper: {
    color: '#d7dce2',
    fontSize: 12,
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
  goldenCell: {
    borderColor: 'rgba(252, 238, 181, 0.72)',
    backgroundColor: 'rgba(252, 238, 181, 0.1)',
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
  goldenHole: {
    backgroundColor: '#8f6a19',
    borderColor: '#f2c94c',
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
  goldenHitHint: {
    color: '#fff4b8',
    fontSize: 12,
  },
});
