import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { DuelMinigameModal } from '@/components/minigames/duel-minigame-modal';
import { API_URL } from '@/constants/api';
import { useGameSession } from '@/contexts/game-session-context';

SplashScreen.preventAutoHideAsync();

type HandCard = {
  id: number;
  rawId: string;
  url_image: string | null;
};

const COMPLETED_CONFLICT_STORAGE_KEY = 'completedConflictKey';
const COMPLETED_CONFLICT_RESULT_STORAGE_KEY = 'completedConflictResult';

const FALLBACK_BOARD = Array.from({ length: 42 }, (_, index) => ({
  index: index + 1,
  type: [5, 7, 9, 11, 15, 18, 21, 25, 27, 31, 34, 37, 40].includes(index + 1) ? 'special' : 'normal',
}));

const normalizeCardId = (value: string | number) => Number(String(value).replace(/\D/g, ''));

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lobbyCode?: string; gameId?: string }>();
  const {
    activeConflict,
    activeGameId,
    activeStar,
    claimStar,
    currentLobbyCode,
    dismissActiveGame,
    emitGameAction,
    gameState,
    isSocketConnected,
    lastGameError,
    latestSpecialEvent,
    lobbyState,
    privateHand,
    setActiveGameId,
    submitMinigameScore,
  } = useGameSession();

  const [loaded, error] = useFonts({
    FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf'),
  });
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedHandCardId, setSelectedHandCardId] = useState<number | null>(null);
  const [selectedVoteCardId, setSelectedVoteCardId] = useState<number | null>(null);
  const [storyClue, setStoryClue] = useState('');
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(true);
  const [completedConflictKey, setCompletedConflictKey] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<string | null>(null);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    const bootstrapUser = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;

        const response = await fetch(`${API_URL}/users/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (response.ok && data.profile?.id) {
          setCurrentUserId(String(data.profile.id));
        }
      } catch {}
    };

    bootstrapUser();
  }, []);

  useEffect(() => {
    const routeLobbyCode = params.lobbyCode ?? params.gameId;
    if (routeLobbyCode && !activeGameId) {
      setActiveGameId(String(routeLobbyCode));
    }
  }, [activeGameId, params.gameId, params.lobbyCode, setActiveGameId]);

  useEffect(() => {
    setSelectedHandCardId(null);
    setSelectedVoteCardId(null);
    setShowConflictModal(true);
    setPendingActionType(null);
    if (gameState?.currentRound?.clue) {
      setStoryClue(gameState.currentRound.clue);
    } else {
      setStoryClue('');
    }
  }, [activeConflict, gameState?.currentRound?.clue, gameState?.phase]);

  useEffect(() => {
    if (!pendingActionType) return;

    const timeout = setTimeout(() => {
      setPendingActionType(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [pendingActionType]);

  useEffect(() => {
    if (!lastGameError) return;
    setPendingActionType(null);
  }, [lastGameError]);

  useEffect(() => {
    if (!isSocketConnected) {
      setPendingActionType(null);
    }
  }, [isSocketConnected]);

  useEffect(() => {
    if (!pendingActionType) return;

    if (gameState?.isMinigameActive) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'SEND_STORY' && (currentRound?.storytellerCardId != null || currentRound?.playedCards?.[storytellerId] != null)) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'SUBMIT_CARD' && currentRound?.playedCards?.[currentUserId] != null) {
      setPendingActionType(null);
      return;
    }

    if (pendingActionType === 'CAST_VOTE' && (currentRound?.votes ?? []).some((vote) => vote.voterId === currentUserId)) {
      setPendingActionType(null);
      return;
    }
  }, [
    currentRound?.playedCards,
    currentRound?.storytellerCardId,
    currentRound?.votes,
    currentUserId,
    gameState?.isMinigameActive,
    pendingActionType,
    storytellerId,
  ]);

  const resolvedLobbyCode = String(currentLobbyCode ?? activeGameId ?? params.lobbyCode ?? params.gameId ?? '');
  const currentPhase = String(gameState?.phase ?? 'WAITING');
  const currentRound = gameState?.currentRound;
  const storytellerId = String(currentRound?.storytellerId ?? '');
  const isStoryteller = storytellerId === currentUserId;
  const isLobbyHost = String(lobbyState?.hostId ?? gameState?.players?.[0] ?? '') === currentUserId;
  const playedCards = currentRound?.playedCards ?? {};
  const votes = currentRound?.votes ?? [];
  const storytellerAlreadyPlayed =
    currentRound?.storytellerCardId != null || playedCards[storytellerId] != null;
  const playerAlreadySubmitted = playedCards[currentUserId] != null;
  const playerAlreadyVoted = votes.some((vote) => vote.voterId === currentUserId);
  const scores = gameState?.scores ?? {};
  const players = (gameState?.players ?? []).map((playerId) => ({
    id: String(playerId),
    score: scores[String(playerId)] ?? 0,
    connected: !(gameState?.disconnectedPlayers ?? []).includes(String(playerId)),
  }));

  const handCards = useMemo<HandCard[]>(
    () =>
      privateHand
        .map((card, index) => {
          if (typeof card === 'number') {
            return {
              id: card,
              rawId: String(card),
              url_image: null,
            };
          }

          const numericId = normalizeCardId(card.id);
          return {
            id: numericId || index + 1,
            rawId: String(card.id),
            url_image: typeof card.url_image === 'string' && card.url_image.trim().length > 0 ? card.url_image : null,
          };
        })
        .filter((card) => Number.isFinite(card.id)),
    [privateHand]
  );

  const boardCards = useMemo(
    () =>
      (currentRound?.boardCards ?? []).map((cardId) => ({
        id: Number(cardId),
      })),
    [currentRound?.boardCards]
  );

  const ownPlayedCardId = playedCards[currentUserId];
  const voteableBoardCards = boardCards.filter((card) => card.id !== ownPlayedCardId);
  const boardTiles = Array.isArray(gameState?.board?.tiles) && gameState.board.tiles.length > 0 ? gameState.board.tiles : FALLBACK_BOARD;
  const boardImage = typeof gameState?.board?.url_image === 'string' ? gameState.board.url_image : null;
  const activeConflictData = gameState?.activeConflict ?? activeConflict ?? null;
  const activeConflictKey = activeConflictData
    ? `${activeConflictData.player1}:${activeConflictData.player2}:${activeConflictData.isDuel ? 'duel' : 'tie'}`
    : null;
  const isParticipant =
    activeConflictData?.player1 === currentUserId || activeConflictData?.player2 === currentUserId;

  useEffect(() => {
    if (!activeConflictData) {
      setShowConflictModal(false);
      setPendingScore(null);
      setCompletedConflictKey(null);
      void AsyncStorage.removeItem(COMPLETED_CONFLICT_STORAGE_KEY);
      void AsyncStorage.removeItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);
      return;
    }

    if (isParticipant && completedConflictKey !== activeConflictKey) {
      setShowConflictModal(true);
    }
  }, [activeConflictData, activeConflictKey, completedConflictKey, isParticipant]);

  useEffect(() => {
    const hydrateCompletedConflict = async () => {
      if (!activeConflictKey) return;

      const storedConflictKey = await AsyncStorage.getItem(COMPLETED_CONFLICT_STORAGE_KEY);
      const storedConflictResult = await AsyncStorage.getItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);

      if (storedConflictKey === activeConflictKey) {
        setCompletedConflictKey(activeConflictKey);
        if (storedConflictResult) {
          const parsed = Number(storedConflictResult);
          if (Number.isFinite(parsed)) {
            setPendingScore(parsed);
          }
        }
        setShowConflictModal(false);
      }
    };

    void hydrateCompletedConflict();
  }, [activeConflictKey]);

  const sendStory = () => {
    if (!selectedHandCardId || !storyClue.trim() || storytellerAlreadyPlayed || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'SEND_STORY',
      payload: {
        cardId: selectedHandCardId,
        clue: storyClue.trim(),
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo enviar la historia porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('SEND_STORY');
  };

  const submitCard = () => {
    if (!selectedHandCardId || playerAlreadySubmitted || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'SUBMIT_CARD',
      payload: {
        cardId: selectedHandCardId,
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo enviar la carta porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('SUBMIT_CARD');
  };

  const castVote = () => {
    if (!selectedVoteCardId || playerAlreadyVoted || pendingActionType) return;

    const emitted = emitGameAction({
      actionType: 'CAST_VOTE',
      payload: {
        cardId: selectedVoteCardId,
      },
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo enviar el voto porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('CAST_VOTE');
  };

  const goNextRound = () => {
    if (pendingActionType || !isLobbyHost) return;

    const emitted = emitGameAction({
      actionType: 'NEXT_ROUND',
    }, resolvedLobbyCode);

    if (!emitted) {
      Alert.alert('Conexion', 'No se pudo avanzar la ronda porque el socket no esta conectado.');
      return;
    }

    setPendingActionType('NEXT_ROUND');
  };

  const leaveFinishedGame = async () => {
    await AsyncStorage.removeItem(COMPLETED_CONFLICT_STORAGE_KEY);
    await AsyncStorage.removeItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY);
    await dismissActiveGame(resolvedLobbyCode);
    router.replace('/menu');
  };

  const renderPhasePanel = () => {
    if (!gameState) {
      return (
        <View style={styles.panel}>
          <ActivityIndicator color="#FCEEB5" />
          <Text style={styles.emptyText}>Esperando el estado inicial de la partida...</Text>
        </View>
      );
    }

    // Si hay un minijuego activo, mostrar panel específico y no la fase normal
    if (gameState.isMinigameActive) {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Minijuego en curso</Text>
          <Text style={styles.noticeText}>
            {activeConflictData
              ? isParticipant
                ? pendingScore !== null
                  ? `Minijuego completado con ${pendingScore} puntos. Esperando la resolucion del servidor.`
                  : activeConflict
                    ? 'Te toca resolver un conflicto. Si no ves el minijuego, espera un momento o reabre la partida.'
                    : 'Hay un conflicto activo. Esperando a recuperar el minijuego correcto.'
                : `Duelo entre ${activeConflictData.player1} y ${activeConflictData.player2}`
              : 'Espera a que termine el minijuego...'}
          </Text>
        </View>
      );
    }

    if (currentPhase === 'STORYTELLING') {
      if (isStoryteller) {
        return (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Tu turno: contar la historia</Text>
            <TextInput
              style={styles.clueInput}
              value={storyClue}
              onChangeText={setStoryClue}
              placeholder="Escribe la pista de la ronda"
              placeholderTextColor="#7b8a97"
            />
            <Text style={styles.noticeText}>Selecciona una carta de tu mano y envíala con la pista.</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!selectedHandCardId || !storyClue.trim() || !isSocketConnected || !!pendingActionType || storytellerAlreadyPlayed) && styles.actionButtonDisabled]}
              disabled={!selectedHandCardId || !storyClue.trim() || !isSocketConnected || !!pendingActionType || storytellerAlreadyPlayed}
              onPress={sendStory}
            >
              <Text style={styles.actionButtonText}>
                {storytellerAlreadyPlayed
                  ? 'Historia enviada'
                  : pendingActionType === 'SEND_STORY'
                    ? 'Enviando...'
                    : 'Enviar historia'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Esperando la pista</Text>
          <Text style={styles.noticeText}>El storyteller actual es {storytellerId || 'otro jugador'}.</Text>
        </View>
      );
    }

    if (currentPhase === 'SUBMISSION') {
      if (!isStoryteller) {
        return (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Envía tu carta</Text>
            <Text style={styles.noticeText}>Pista de la ronda: {currentRound?.clue ?? 'sin pista todavía'}</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!selectedHandCardId || !isSocketConnected || !!pendingActionType || playerAlreadySubmitted) && styles.actionButtonDisabled]}
              disabled={!selectedHandCardId || !isSocketConnected || !!pendingActionType || playerAlreadySubmitted}
              onPress={submitCard}
            >
              <Text style={styles.actionButtonText}>
                {playerAlreadySubmitted
                  ? 'Carta enviada'
                  : pendingActionType === 'SUBMIT_CARD'
                    ? 'Enviando...'
                    : 'Enviar carta'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Esperando al resto</Text>
          <Text style={styles.noticeText}>Tu pista es: {currentRound?.clue ?? 'sin pista'}.</Text>
        </View>
      );
    }

    if (currentPhase === 'VOTING') {
      if (!isStoryteller) {
        return (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Vota una carta</Text>
            <Text style={styles.noticeText}>No puedes votar tu propia carta. Pista: {currentRound?.clue ?? 'sin pista'}.</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!selectedVoteCardId || !isSocketConnected || !!pendingActionType || playerAlreadyVoted) && styles.actionButtonDisabled]}
              disabled={!selectedVoteCardId || !isSocketConnected || !!pendingActionType || playerAlreadyVoted}
              onPress={castVote}
            >
              <Text style={styles.actionButtonText}>
                {playerAlreadyVoted
                  ? 'Voto enviado'
                  : pendingActionType === 'CAST_VOTE'
                    ? 'Enviando...'
                    : 'Confirmar voto'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Votación en curso</Text>
          <Text style={styles.noticeText}>Espera a que el resto vote tu carta.</Text>
        </View>
      );
    }

    if (currentPhase === 'SCORING') {
      
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Puntuación de la ronda</Text>
          <Text style={styles.noticeText}>Pista: {currentRound?.clue ?? 'sin pista'}</Text>
          <Text style={styles.noticeText}>Cartas jugadas: {Object.keys(currentRound?.playedCards ?? {}).length}</Text>
          <Text style={styles.noticeText}>Votos emitidos: {(currentRound?.votes ?? []).length}</Text>
          {isLobbyHost ? (
            <TouchableOpacity style={[styles.actionButton, (!isSocketConnected || !!pendingActionType) && styles.actionButtonDisabled]} disabled={!isSocketConnected || !!pendingActionType} onPress={goNextRound}>
              <Text style={styles.actionButtonText}>
                {pendingActionType === 'NEXT_ROUND' ? 'Avanzando...' : 'Siguiente ronda'}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.noticeText}>Esperando a que el anfitrion avance la siguiente ronda.</Text>
          )}
        </View>
      );
    }

    if (currentPhase === 'FINISHED') {
      return (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Partida terminada</Text>
          <Text style={styles.noticeText}>Ya hay un ganador. Puedes revisar la puntuación final abajo.</Text>
        </View>
      );
    }

    return (
      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Esperando fase</Text>
        <Text style={styles.noticeText}>El backend aún no ha enviado una fase jugable.</Text>
      </View>
    );
  };

  if (!loaded && !error) return null;

  return (
    <ImageBackground source={require('../assets/images/background.jpg')} style={styles.background} resizeMode="cover">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.replace('/menu')}>
            <Text style={styles.headerButtonText}>Menu</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.titleContainer} onPress={() => router.replace('/menu')}>
            <Svg height="100%" width="100%" viewBox="0 0 320 52">
              <SvgText fill="black" stroke="#FCEEB5" strokeWidth="0.8" fontSize="26" fontFamily="FuenteTitulo" x="0" y="35">
                A Tale Of Recognition
              </SvgText>
            </Svg>
          </TouchableOpacity>
          <View style={styles.socketPill}>
            <Text style={styles.socketPillText}>{isSocketConnected ? 'Socket OK' : 'Socket OFF'}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroPanel}>
            <Text style={styles.heroLabel}>Partida real</Text>
            <Text style={styles.heroTitle}>{resolvedLobbyCode || 'Sin lobby'}</Text>
            <Text style={styles.heroSubtitle}>
              Fase: {currentPhase}
              {currentRound?.clue ? ` · Pista: ${currentRound.clue}` : ''}
              {currentRound?.storytellerId ? ` · Storyteller: ${currentRound.storytellerId}` : ''}
              {gameState?.isMinigameActive ? ' · Minijuego activo' : ''}
            </Text>
          </View>

          {renderPhasePanel()}

          {currentPhase === 'FINISHED' ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Cerrar partida</Text>
              <Text style={styles.noticeText}>Cuando quieras, puedes salir al menu y empezar otra sala.</Text>
              <TouchableOpacity style={styles.actionButton} onPress={leaveFinishedGame}>
                <Text style={styles.actionButtonText}>Salir al menu</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {latestSpecialEvent ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Evento especial</Text>
              <Text style={styles.noticeText}>{latestSpecialEvent.effect ?? 'Evento'} para {latestSpecialEvent.pId ?? 'un jugador'}</Text>
            </View>
          ) : null}

          {activeStar ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Estrella fugaz</Text>
              <Text style={styles.noticeText}>Hay una estrella activa durante {activeStar.duration}s.</Text>
              <TouchableOpacity style={styles.actionButton} disabled={!currentUserId} onPress={() => claimStar(currentUserId, resolvedLobbyCode)}>
                <Text style={styles.actionButtonText}>Intentar atraparla</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Tu mano</Text>
              <Text style={styles.mutedText}>{handCards.length} cartas</Text>
            </View>
            {handCards.length === 0 ? (
              <Text style={styles.emptyText}>Todavía no ha llegado tu mano privada.</Text>
            ) : (
              <View style={styles.cardGrid}>
                {handCards.map((card) => {
                  const selected = selectedHandCardId === card.id;
                  return (
                    <TouchableOpacity key={card.rawId} style={[styles.handCard, selected && styles.handCardSelected]} onPress={() => setSelectedHandCardId(card.id)}>
                      {card.url_image ? (
                        <Image source={{ uri: card.url_image }} style={styles.handCardImage} />
                      ) : (
                        <View style={styles.placeholderCardFace}>
                          <Text style={styles.placeholderCardId}>Carta {card.id}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {currentPhase === 'VOTING' ? (
            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Cartas en mesa</Text>
                <Text style={styles.mutedText}>{voteableBoardCards.length} opciones</Text>
              </View>
              <View style={styles.boardCardGrid}>
                {voteableBoardCards.map((card) => {
                  const selected = selectedVoteCardId === card.id;
                  return (
                    <TouchableOpacity key={`board-${card.id}`} style={[styles.boardCard, selected && styles.boardCardSelected]} onPress={() => setSelectedVoteCardId(card.id)}>
                      <Text style={styles.boardCardLabel}>Carta</Text>
                      <Text style={styles.boardCardId}>{card.id}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Jugadores</Text>
              <Text style={styles.mutedText}>{players.length} en partida</Text>
            </View>
            {players.length === 0 ? (
              <Text style={styles.emptyText}>Todavía no ha llegado el estado del tablero.</Text>
            ) : (
              players.map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <View style={styles.playerIdentity}>
                    <View style={[styles.playerDot, { backgroundColor: player.connected ? '#2ecc71' : '#7f8c8d' }]} />
                    <View>
                      <Text style={styles.playerName}>{player.id}</Text>
                      <Text style={styles.playerMeta}>Puntos: {player.score} · Casilla: {player.score}</Text>
                    </View>
                  </View>
                  {player.id === currentUserId ? <Text style={styles.selfBadge}>Tu</Text> : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Tablero</Text>
            {boardImage ? <Image source={{ uri: boardImage }} style={styles.boardPreview} resizeMode="cover" /> : null}
            <Text style={styles.helpText}>Si el backend aún no manda la geometría del tablero, seguimos mostrando una guía mística de posiciones.</Text>
            <View style={styles.boardGrid}>
              {boardTiles.map((tile: any, index) => {
                const tileIndex = tile.index ?? tile.numero ?? index + 1;
                const tileType = tile.type ?? tile.tipo ?? 'normal';
                const occupants = players.filter((player) => player.score === tileIndex);
                const glyph = tileType !== 'normal' ? ['✦', '✧', '☽', '✶'][tileIndex % 4] : ['·', '✧', '✦'][tileIndex % 3];

                return (
                  <View key={`${tileIndex}-${index}`} style={[styles.boardTile, tileType !== 'normal' && styles.boardTileSpecial]}>
                    <Text style={styles.boardTileGlyph}>{glyph}</Text>
                    <Text style={styles.boardTileText}>{tileIndex}</Text>
                    {occupants.length > 0 ? (
                      <View style={styles.tileOccupants}>
                        {occupants.map((player) => (
                          <View key={player.id} style={styles.tileBadge}>
                            <Text style={styles.tileBadgeText}>{player.id.charAt(0).toUpperCase()}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          {false && pendingScore !== null && activeConflictData && isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Resolver duelo</Text>
              <Text style={styles.noticeText}>Tu minijuego terminó con {pendingScore} puntos. Elige el ganador final.</Text>
              <View style={styles.targetList}>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData.player1)}>
                  <Text style={styles.targetButtonText}>Gana {activeConflictData.player1}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData.player2)}>
                  <Text style={styles.targetButtonText}>Gana {activeConflictData.player2}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeConflictData && !isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Duelo en curso</Text>
              <Text style={styles.noticeText}>{activeConflictData.player1} y {activeConflictData.player2} están resolviendo un conflicto.</Text>
            </View>
          ) : null}
        </ScrollView>

        <DuelMinigameModal
          conflict={showConflictModal ? activeConflict : null}
          currentUserId={currentUserId}
          onClose={() => setShowConflictModal(false)}
          onResolved={(score) => {
            setPendingScore(score);
            if (activeConflictKey) {
              setCompletedConflictKey(activeConflictKey);
              void AsyncStorage.setItem(COMPLETED_CONFLICT_STORAGE_KEY, activeConflictKey);
              void AsyncStorage.setItem(COMPLETED_CONFLICT_RESULT_STORAGE_KEY, String(score));
            }
            if (resolvedLobbyCode) {
              submitMinigameScore(score, resolvedLobbyCode);
            }
            setShowConflictModal(false);
          }}
        />
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'rgba(12, 28, 40, 0.78)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(252,238,181,0.2)',
  },
  headerButton: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  headerButtonText: { color: '#FCEEB5', fontWeight: 'bold' },
  titleContainer: { flex: 1, height: 42 },
  socketPill: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  socketPillText: { color: '#d7dce2', fontSize: 11, fontWeight: 'bold' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 44 },
  heroPanel: { backgroundColor: 'rgba(8, 19, 29, 0.96)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#FCEEB5' },
  heroLabel: { color: '#8caea6', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 'bold', marginBottom: 8 },
  heroTitle: { color: '#FCEEB5', fontSize: 26, fontWeight: 'bold' },
  heroSubtitle: { color: '#d7dce2', marginTop: 8, lineHeight: 20 },
  panel: { backgroundColor: 'rgba(30, 60, 75, 0.85)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(252,238,181,0.18)', gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionLabel: { color: '#FCEEB5', fontSize: 18, fontWeight: 'bold' },
  mutedText: { color: '#a0b0b9', fontSize: 12 },
  noticeText: { color: '#d7dce2', lineHeight: 20 },
  emptyText: { color: '#d7dce2', textAlign: 'center', lineHeight: 20 },
  clueInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#10212e',
  },
  actionButton: { alignSelf: 'flex-start', backgroundColor: '#FCEEB5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  actionButtonDisabled: { opacity: 0.45 },
  actionButtonText: { color: '#10212e', fontWeight: 'bold' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  handCard: {
    width: 96,
    height: 138,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.16)',
  },
  handCardSelected: {
    borderColor: '#FCEEB5',
    transform: [{ translateY: -6 }],
  },
  handCardImage: {
    width: '100%',
    height: '100%',
  },
  placeholderCardFace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  placeholderCardId: {
    color: '#FCEEB5',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  boardCardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  boardCard: {
    width: 88,
    height: 124,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  boardCardSelected: {
    borderColor: '#FCEEB5',
    backgroundColor: 'rgba(252,238,181,0.16)',
  },
  boardCardLabel: {
    color: '#8caea6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  boardCardId: {
    color: '#FCEEB5',
    fontSize: 24,
    fontWeight: 'bold',
  },
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerDot: { width: 12, height: 12, borderRadius: 999 },
  playerName: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 16 },
  playerMeta: { color: '#d7dce2', marginTop: 4, fontSize: 12 },
  selfBadge: { color: '#10212e', backgroundColor: '#A8C8C0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontWeight: 'bold' },
  helpText: { color: '#a0b0b9', fontSize: 12, lineHeight: 18 },
  boardPreview: {
    width: '100%',
    height: 130,
    borderRadius: 16,
  },
  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  boardTile: {
    width: 48,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(18, 30, 48, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(252,238,181,0.18)',
  },
  boardTileSpecial: {
    backgroundColor: 'rgba(88, 53, 109, 0.94)',
    borderColor: '#FCEEB5',
  },
  boardTileGlyph: {
    color: '#FCEEB5',
    fontSize: 12,
    marginBottom: 2,
    opacity: 0.85,
  },
  boardTileText: { color: '#dfe7ef', fontWeight: 'bold', fontSize: 11 },
  tileOccupants: { position: 'absolute', bottom: -6, flexDirection: 'row', gap: 2 },
  tileBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: '#2c3e50',
  },
  tileBadgeText: { color: '#FCEEB5', fontSize: 8, fontWeight: 'bold' },
  targetList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  targetButton: { backgroundColor: '#A8C8C0', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14 },
  targetButtonText: { color: '#10212e', fontWeight: 'bold' },
});
