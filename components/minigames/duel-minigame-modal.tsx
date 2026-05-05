import { GameConflictPayload } from '@/types/game';
import { useEffect, useState } from 'react';
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

export function DuelMinigameModal({
  conflict,
  currentUserId,
  onResolved,
  onClose,
}: DuelMinigameModalProps) {
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    setScore(null);
  }, [conflict]);

  useEffect(() => {
    if (score === null) return;

    const timeout = setTimeout(() => {
      onResolved(score);
    }, 1200);

    return () => clearTimeout(timeout);
  }, [onResolved, score]);

  if (!conflict) return null;

  const isParticipant =
    currentUserId === conflict.player1 || currentUserId === conflict.player2;
  const normalizedDuration =
    conflict.duration > 1000 ? Math.max(1, Math.ceil(conflict.duration / 1000)) : conflict.duration;

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

    if (score !== null) {
      return (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingTitle}>Resultado listo</Text>
          <Text style={styles.waitingText}>Tu puntuacion ha sido {score}. Esperando a que la partida se desbloquee.</Text>
          <TouchableOpacity style={styles.actionButton} onPress={() => onResolved(score)}>
            <Text style={styles.actionButtonText}>Aceptar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    switch (conflict.type) {
      case 0:
        return <WhackMoleDuel duration={normalizedDuration} onComplete={setScore} />;
      case 1:
        return <MemoryPairsDuel duration={normalizedDuration} onComplete={setScore} />;
      case 2:
        return <FruitBasketDuel duration={normalizedDuration} onComplete={setScore} />;
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
          {!isParticipant || score !== null ? (
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{score !== null ? 'Ocultar' : 'Cerrar'}</Text>
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
  actionButton: {
    backgroundColor: '#A8C8C0',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  actionButtonText: {
    color: '#10212e',
    fontWeight: 'bold',
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
