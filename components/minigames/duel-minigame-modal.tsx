import { GameConflictPayload } from '@/types/game';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FruitBasketDuel } from './fruit-basket-duel';
import { MemoryPairsDuel } from './memory-pairs-duel';
import { WhackMoleDuel } from './whack-mole-duel';

type DuelMinigameModalProps = {
  conflict: GameConflictPayload | null;
  currentUserId: string;
  onResolved: (score: number) => void;
  onClose: () => void;
};

const PRE_GAME_COUNTDOWN_MS = 3000;
const PRE_GAME_COUNTDOWN_SECONDS = 3;

export function DuelMinigameModal({
  conflict,
  currentUserId,
  onResolved,
  onClose,
}: DuelMinigameModalProps) {
  const conflictIdentity = conflict
    ? `${[conflict.player1, conflict.player2].filter(Boolean).sort().join(':')}:${conflict.type}:${conflict.duration}:${conflict.isDuel ? 'duel' : 'tie'}`
    : null;
  const conflictPlayer1 = conflict?.player1 ?? '';
  const conflictPlayer2 = conflict?.player2 ?? '';
  const conflictDuration = conflict?.duration ?? 0;
  const [countdown, setCountdown] = useState<number | 'go' | null>(PRE_GAME_COUNTDOWN_SECONDS);
  const [gameStarted, setGameStarted] = useState(false);
  const [resolvedScore, setResolvedScore] = useState<number | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    resolvedRef.current = false;
    setResolvedScore(null);
    setGameStarted(false);
    setCountdown(PRE_GAME_COUNTDOWN_SECONDS);
  }, [conflictIdentity]);

  useEffect(() => {
    if (!conflictIdentity) return;

    const isParticipant =
      currentUserId === conflictPlayer1 || currentUserId === conflictPlayer2;
    if (!isParticipant) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setCountdown(2), 1000));
    timers.push(setTimeout(() => setCountdown(1), 2000));
    timers.push(setTimeout(() => setCountdown('go'), 2800));
    timers.push(
      setTimeout(() => {
        setCountdown(null);
        setGameStarted(true);
      }, PRE_GAME_COUNTDOWN_MS)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [conflictIdentity, conflictPlayer1, conflictPlayer2, currentUserId]);

  const submitScore = useCallback(
    (nextScore: number) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setResolvedScore(nextScore);
      setGameStarted(false);
      onResolved(nextScore);
    },
    [onResolved]
  );

  const isParticipant = conflict
    ? currentUserId === conflict.player1 || currentUserId === conflict.player2
    : false;
  const normalizedDuration = useMemo(() => {
    if (!conflictIdentity) return 1;
    const durationMs = conflictDuration > 1000 ? conflictDuration : conflictDuration * 1000;
    const playableMs = Math.max(1000, durationMs - PRE_GAME_COUNTDOWN_MS);
    return Math.max(1, Math.ceil(playableMs / 1000));
  }, [conflictDuration, conflictIdentity]);
  const minigameKey = conflict
    ? `${[conflict.player1, conflict.player2].filter(Boolean).sort().join('-')}-${conflict.type}-${conflict.duration}-${conflict.isDuel ? 'duel' : 'tie'}`
    : 'inactive';

  if (!conflict) return null;

  const renderMinigame = () => {
    if (!isParticipant) {
      return (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingTitle}>Duelo en curso</Text>
          <Text style={styles.waitingText}>
            Otros dos jugadores están resolviendo un conflicto. La partida volverá cuando termine.
          </Text>
        </View>
      );
    }

    if (resolvedScore !== null || resolvedRef.current) {
      return (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingTitle}>Resultado enviado</Text>
          <Text style={styles.waitingText}>Tu puntuacion ha sido {resolvedScore ?? 0}. Esperando a la partida.</Text>
        </View>
      );
    }

    if (!gameStarted) {
      return (
        <View style={styles.countdownBox}>
          <Text style={styles.countdownText}>{countdown === 'go' ? '¡Ya!' : countdown}</Text>
        </View>
      );
    }

    switch (conflict.type) {
      case 0:
        return <WhackMoleDuel key={minigameKey} duration={normalizedDuration} onComplete={submitScore} />;
      case 1:
        return <MemoryPairsDuel key={minigameKey} duration={normalizedDuration} onComplete={submitScore} />;
      case 2:
        return <FruitBasketDuel key={minigameKey} duration={normalizedDuration} onComplete={submitScore} />;
      default:
        return null;
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.label}>{conflict.isDuel ? 'Duelo' : 'Desempate'}</Text>
          {renderMinigame()}
          {!isParticipant || resolvedScore !== null ? (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{resolvedScore !== null ? 'Ocultar' : 'Cerrar'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  container: {
    width: '100%',
    maxWidth: 470,
    backgroundColor: 'rgba(10, 25, 40, 0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FCEEB5',
    padding: 22,
    gap: 16,
  },
  label: {
    color: '#8caea6',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: 'bold',
  },
  waitingBox: {
    gap: 10,
    alignItems: 'center',
  },
  waitingTitle: {
    color: '#FCEEB5',
    fontSize: 22,
    fontWeight: 'bold',
  },
  waitingText: {
    color: '#d7dce2',
    textAlign: 'center',
    lineHeight: 20,
  },
  countdownBox: {
    minHeight: 260,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#FCEEB5',
    fontSize: 76,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  closeButton: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#FCEEB5',
    fontWeight: '600',
  },
});
