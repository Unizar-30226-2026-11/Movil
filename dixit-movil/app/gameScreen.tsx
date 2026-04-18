import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { DuelMinigameModal } from '@/components/minigames/duel-minigame-modal';
import { API_URL } from '@/constants/api';
import { useGameSession } from '@/contexts/game-session-context';
import { GameConflictPayload } from '@/types/game';

SplashScreen.preventAutoHideAsync();

const FALLBACK_BOARD = Array.from({ length: 42 }, (_, index) => ({ index: index + 1, type: (index + 1) % 7 === 0 ? 'special' : 'normal' }));
const DEBUG_USER_ID = 'debug-me';
const DEBUG_HAND = [11, 24, 37, 48, 52, 67];
const DEBUG_CLUES = ['Una mirada perdida.', 'El ultimo tren a ninguna parte.', 'Un silencio ensordecedor.', 'El peso de la corona.', 'Caida libre sin paracaidas.', 'Un reflejo enganoso.'];
const DEBUG_CARD_ART = [
  { id: 11, title: 'Bosque dormido', art: '🌲' },
  { id: 24, title: 'Reina de humo', art: '👑' },
  { id: 37, title: 'Cielo roto', art: '🌩️' },
  { id: 48, title: 'Ojo del lago', art: '🪞' },
  { id: 52, title: 'Jardin secreto', art: '🌸' },
  { id: 67, title: 'Puerta lunar', art: '🌙' },
  { id: 70, title: 'Violin rojo', art: '🎻' },
  { id: 71, title: 'Reloj de arena', art: '⏳' },
  { id: 72, title: 'Gigante amable', art: '🗿' },
];
const DEBUG_PLAYERS = [
  { id: DEBUG_USER_ID, username: 'TuJugador', score: 8, position: 8, connected: true, color: '#e67e22' },
  { id: 'debug-rival-1', username: 'TopoMaster', score: 11, position: 11, connected: true, color: '#2ecc71' },
  { id: 'debug-rival-2', username: 'MemoriaPro', score: 14, position: 14, connected: true, color: '#3498db' },
  { id: 'debug-rival-3', username: 'FrutaRush', score: 17, position: 17, connected: true, color: '#9b59b6' },
];
const DEBUG_STATE = { gameId: 'debug-game', lobbyCode: 'DEBUG1', phase: 'STORYTELLING', timer: 42, turnOf: DEBUG_USER_ID, players: DEBUG_PLAYERS, board: { tiles: FALLBACK_BOARD } };

type DebugRoundPhase = 'choose' | 'vote' | 'score';
type DebugCard = (typeof DEBUG_CARD_ART)[number];

const randomClue = (exclude?: string) => {
  const pool = DEBUG_CLUES.filter((clue) => clue !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] ?? DEBUG_CLUES[0];
};

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
const nextPosition = (current: number, amount: number) => Math.min(42, current + amount);

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gameId?: string; lobbyCode?: string }>();
  const { activeConflict, activeGameId, activeStar, claimStar, clearConflict, gameState, isSocketConnected, latestSpecialEvent, privateHand, setActiveGameId, submitConflictResult } = useGameSession();
  const [loaded, error] = useFonts({ FuenteTitulo: require('../assets/fonts/fuente-dilana.ttf') });
  const [currentUserId, setCurrentUserId] = useState('');
  const [pendingScore, setPendingScore] = useState<number | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [debugState, setDebugState] = useState<typeof DEBUG_STATE | null>(null);
  const [debugHand, setDebugHand] = useState<number[]>([]);
  const [debugConflict, setDebugConflict] = useState<GameConflictPayload | null>(null);
  const [debugNotice, setDebugNotice] = useState<string | null>(null);
  const [debugStarVisible, setDebugStarVisible] = useState(false);
  const [debugRoundPhase, setDebugRoundPhase] = useState<DebugRoundPhase>('choose');
  const [debugClue, setDebugClue] = useState(DEBUG_CLUES[0]);
  const [debugSelectedCard, setDebugSelectedCard] = useState<number | null>(null);
  const [debugVoteCard, setDebugVoteCard] = useState<number | null>(null);
  const [debugVotingCards, setDebugVotingCards] = useState<DebugCard[]>([]);
  const [debugProgress, setDebugProgress] = useState(0);
  const [debugWildcards, setDebugWildcards] = useState<{ id: string; value: number }[]>([]);
  const debugTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  useEffect(() => {
    const bootstrapUser = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const response = await fetch(`${API_URL}/users/profile`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (response.ok && data.profile?.id) setCurrentUserId(String(data.profile.id));
      } catch {}
    };
    bootstrapUser();
  }, []);

  useEffect(() => {
    const routeGameId = params.gameId ?? params.lobbyCode;
    if (routeGameId && !activeGameId) setActiveGameId(String(routeGameId));
  }, [activeGameId, params.gameId, params.lobbyCode, setActiveGameId]);

  useEffect(() => {
    setShowConflictModal(true);
    setPendingScore(null);
  }, [activeConflict, debugConflict]);

  useEffect(() => () => {
    debugTimeoutsRef.current.forEach(clearTimeout);
    debugTimeoutsRef.current = [];
  }, []);

  const effectiveCurrentUserId = debugMode ? DEBUG_USER_ID : currentUserId;
  const effectiveGameState = debugMode ? debugState : gameState;
  const effectiveConflict = debugMode ? debugConflict : activeConflict;
  const effectiveHand = debugMode ? debugHand : privateHand;
  const effectiveStar = debugMode ? (debugStarVisible ? { starId: 'debug-star', duration: 3 } : null) : activeStar;
  const effectiveNotice = debugMode ? (debugNotice ? { effect: debugNotice, pId: effectiveCurrentUserId } : null) : latestSpecialEvent;
  const resolvedGameId = String((debugMode ? debugState?.gameId : activeGameId) ?? params.gameId ?? params.lobbyCode ?? '');
  const players = useMemo(() => effectiveGameState?.players ?? [], [effectiveGameState?.players]);
  const currentPhase = String(effectiveGameState?.phase ?? 'WAITING');
  const timer = typeof effectiveGameState?.timer === 'number' ? effectiveGameState.timer : null;
  const currentTurnPlayer = players.find((player) => player.id === effectiveGameState?.turnOf);
  const isCurrentTurn = currentTurnPlayer?.id === effectiveCurrentUserId;
  const boardTiles = Array.isArray(effectiveGameState?.board?.tiles) && effectiveGameState.board.tiles.length > 0 ? effectiveGameState.board.tiles : FALLBACK_BOARD;
  const activeConflictData: GameConflictPayload | null = effectiveConflict;
  const isConflictResolver = activeConflictData?.player1 === effectiveCurrentUserId;
  const isParticipant = activeConflictData?.player1 === effectiveCurrentUserId || activeConflictData?.player2 === effectiveCurrentUserId;
  const debugHandCards = DEBUG_CARD_ART.filter((card) => effectiveHand.includes(card.id));

  const clearDebugTimeouts = () => {
    debugTimeoutsRef.current.forEach(clearTimeout);
    debugTimeoutsRef.current = [];
  };

  const queueDebugTimeout = (callback: () => void, delay: number) => {
    const timeout = setTimeout(callback, delay);
    debugTimeoutsRef.current.push(timeout);
  };

  const resetDebugRound = (keepWildcards = true) => {
    setDebugRoundPhase('choose');
    setDebugClue(randomClue(debugClue));
    setDebugSelectedCard(null);
    setDebugVoteCard(null);
    setDebugVotingCards([]);
    setDebugProgress(0);
    if (!keepWildcards) setDebugWildcards([]);
  };

  const startDebugGame = () => {
    clearDebugTimeouts();
    setDebugMode(true);
    setDebugState(DEBUG_STATE);
    setDebugHand(DEBUG_HAND);
    setDebugNotice(null);
    setDebugStarVisible(false);
    setDebugConflict(null);
    setPendingScore(null);
    setShowConflictModal(false);
    setDebugWildcards([]);
    setDebugClue(randomClue());
    setDebugRoundPhase('choose');
    setDebugSelectedCard(null);
    setDebugVoteCard(null);
    setDebugVotingCards([]);
    setDebugProgress(0);
  };

  const resetDebugState = () => {
    clearDebugTimeouts();
    setDebugMode(false);
    setDebugState(null);
    setDebugHand([]);
    setDebugConflict(null);
    setDebugNotice(null);
    setDebugStarVisible(false);
    setPendingScore(null);
    setShowConflictModal(false);
    resetDebugRound(false);
  };

  const buildVotingCards = (selectedCardId: number) => {
    const selected = DEBUG_CARD_ART.find((card) => card.id === selectedCardId);
    const alternatives = shuffle(DEBUG_CARD_ART.filter((card) => card.id !== selectedCardId)).slice(0, 3);
    return shuffle([selected, ...alternatives].filter(Boolean) as DebugCard[]);
  };

  const runDebugProgress = (phase: DebugRoundPhase, onDone: () => void) => {
    setDebugRoundPhase(phase);
    setDebugProgress(1);
    queueDebugTimeout(() => setDebugProgress(2), 700);
    queueDebugTimeout(() => setDebugProgress(3), 1400);
    queueDebugTimeout(() => setDebugProgress(4), 2100);
    queueDebugTimeout(() => {
      setDebugProgress(0);
      onDone();
    }, 2800);
  };

  const handleDebugPlayCard = () => {
    if (!debugSelectedCard) return;
    clearDebugTimeouts();
    runDebugProgress('choose', () => {
      setDebugVotingCards(buildVotingCards(debugSelectedCard));
      setDebugRoundPhase('vote');
    });
  };

  const handleDebugVote = () => {
    if (!debugVoteCard) return;
    clearDebugTimeouts();
    runDebugProgress('score', () => {
      const myMove = Math.floor(Math.random() * 4) + 2;
      const myCurrent = (debugState?.players ?? DEBUG_PLAYERS).find((player) => player.id === DEBUG_USER_ID);
      const myNextPosition = nextPosition(myCurrent?.position ?? myCurrent?.score ?? 1, myMove);

      setDebugState((prev) =>
        prev
          ? {
              ...prev,
              phase: 'SCORING',
              players: prev.players.map((player) => {
                const moveBy = player.id === DEBUG_USER_ID ? myMove : Math.floor(Math.random() * 4) + 1;
                return {
                  ...player,
                  score: (player.score ?? 0) + moveBy,
                  position: nextPosition(player.position ?? player.score ?? 1, moveBy),
                };
              }),
            }
          : prev
      );

      if (myNextPosition % 7 === 0) {
        const wildcardValue = Math.floor(Math.random() * 3) + 1;
        setDebugWildcards((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, value: wildcardValue }]);
        setDebugNotice(`COMODIN +${wildcardValue}`);
      } else {
        setDebugNotice('Ronda resuelta');
      }

      queueDebugTimeout(() => {
        setDebugState((prev) => (prev ? { ...prev, phase: 'STORYTELLING', turnOf: DEBUG_USER_ID } : prev));
        resetDebugRound(true);
      }, 1400);
    });
  };

  const applyDebugWildcard = (wildcardId: string, value: number) => {
    setDebugWildcards((prev) => prev.filter((wildcard) => wildcard.id !== wildcardId));
    setDebugNotice(`Comodin usado +${value}`);
    setDebugState((prev) =>
      prev
        ? {
            ...prev,
            players: prev.players.map((player) =>
              player.id === DEBUG_USER_ID
                ? {
                    ...player,
                    score: (player.score ?? 0) + value,
                    position: nextPosition(player.position ?? player.score ?? 1, value),
                  }
                : player
            ),
          }
        : prev
    );
  };

  const startDebugConflict = (type: 0 | 1 | 2, isDuel = true) => {
    startDebugGame();
    setDebugConflict({ player1: DEBUG_USER_ID, player2: 'debug-rival-1', type, duration: 15, isDuel });
    setShowConflictModal(true);
  };

  const resolveConflictWinner = (winnerId: string) => {
    if (!activeConflictData || !resolvedGameId) return;
    const loserId = winnerId === activeConflictData.player1 ? activeConflictData.player2 : activeConflictData.player1;

    if (debugMode) {
      setDebugNotice(`${activeConflictData.isDuel ? 'DUEL_WIN' : 'MINIGAME_WIN'} · Gana ${winnerId}`);
      setDebugState((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((player) => {
                if (player.id === winnerId) {
                  return {
                    ...player,
                    score: (player.score ?? 0) + (activeConflictData.isDuel ? 2 : 1),
                    position: nextPosition(player.position ?? player.score ?? 1, activeConflictData.isDuel ? 2 : 1),
                  };
                }
                if (player.id === loserId && activeConflictData.isDuel) {
                  return { ...player, score: Math.max(0, (player.score ?? 0) - 2) };
                }
                return player;
              }),
            }
          : prev
      );
      setDebugConflict(null);
      setPendingScore(null);
      setShowConflictModal(false);
      return;
    }

    submitConflictResult(winnerId, loserId, activeConflictData.isDuel, resolvedGameId);
    clearConflict();
    setPendingScore(null);
    setShowConflictModal(false);
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
            <Text style={styles.heroLabel}>Partida</Text>
            <Text style={styles.heroTitle}>{resolvedGameId || 'Esperando gameId'}</Text>
            <Text style={styles.heroSubtitle}>
              Fase: {currentPhase}
              {timer !== null ? ` · Tiempo: ${timer}s` : ''}
              {currentTurnPlayer ? ` · Turno: ${currentTurnPlayer.username ?? currentTurnPlayer.name ?? currentTurnPlayer.id}` : ''}
              {isCurrentTurn ? ' · Te toca jugar' : ''}
            </Text>
          </View>

          {!resolvedGameId ? (
            <View style={styles.panel}>
              <ActivityIndicator color="#FCEEB5" />
              <Text style={styles.emptyText}>Esperando a recuperar la sesion de juego o a recibir el estado inicial por socket.</Text>
            </View>
          ) : null}

          {effectiveNotice ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Evento especial</Text>
              <Text style={styles.noticeText}>{effectiveNotice.effect ?? 'Evento'} para {effectiveNotice.pId ?? 'un jugador'}</Text>
            </View>
          ) : null}

          {effectiveStar ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Estrella fugaz</Text>
              <Text style={styles.noticeText}>Hay una estrella activa durante {effectiveStar.duration}s.</Text>
              <TouchableOpacity
                style={styles.actionButton}
                disabled={!effectiveCurrentUserId}
                onPress={() => {
                  if (debugMode) {
                    setDebugStarVisible(false);
                    setDebugNotice('STAR_CLAIMED');
                    setDebugState((prev) =>
                      prev
                        ? {
                            ...prev,
                            players: prev.players.map((player) =>
                              player.id === effectiveCurrentUserId
                                ? { ...player, score: (player.score ?? 0) + 3, position: nextPosition(player.position ?? player.score ?? 1, 3) }
                                : player
                            ),
                          }
                        : prev
                    );
                    return;
                  }
                  claimStar(effectiveCurrentUserId, resolvedGameId);
                }}
              >
                <Text style={styles.actionButtonText}>Intentar atraparla</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Jugadores</Text>
              <Text style={styles.mutedText}>{players.length} en partida</Text>
            </View>
            {players.length === 0 ? (
              <Text style={styles.emptyText}>Todavia no ha llegado el estado del tablero.</Text>
            ) : (
              players.map((player) => (
                <View key={player.id} style={styles.playerRow}>
                  <View style={styles.playerIdentity}>
                    <View style={[styles.playerDot, { backgroundColor: (player as { color?: string }).color ?? '#A8C8C0' }]} />
                    <View>
                      <Text style={styles.playerName}>{player.username ?? player.name ?? player.id}</Text>
                      <Text style={styles.playerMeta}>
                        Puntos: {player.score ?? 0}
                        {player.position !== undefined ? ` · Casilla: ${player.position}` : ''}
                      </Text>
                    </View>
                  </View>
                  {player.id === effectiveCurrentUserId ? <Text style={styles.selfBadge}>Tu</Text> : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Debug</Text>
              <Text style={styles.mutedText}>{debugMode ? 'Activo' : 'Inactivo'}</Text>
            </View>
            <Text style={styles.helpText}>Mantiene minijuegos y tambien una simulacion de ronda completa.</Text>
            <View style={styles.targetList}>
              <TouchableOpacity style={styles.targetButton} onPress={startDebugGame}><Text style={styles.targetButtonText}>Partida mock</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={() => startDebugConflict(0)}><Text style={styles.targetButtonText}>Duelo Topos</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={() => startDebugConflict(1)}><Text style={styles.targetButtonText}>Duelo Memoria</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={() => startDebugConflict(2)}><Text style={styles.targetButtonText}>Duelo Frutas</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={() => { startDebugGame(); setDebugConflict({ player1: DEBUG_USER_ID, player2: 'debug-rival-2', type: 1, duration: 15, isDuel: false }); setShowConflictModal(true); }}><Text style={styles.targetButtonText}>Desempate</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={() => { startDebugGame(); setDebugStarVisible(true); }}><Text style={styles.targetButtonText}>Estrella</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={() => { startDebugGame(); setDebugNotice('ODD'); }}><Text style={styles.targetButtonText}>Evento especial</Text></TouchableOpacity>
              <TouchableOpacity style={styles.targetButton} onPress={resetDebugState}><Text style={styles.targetButtonText}>Salir debug</Text></TouchableOpacity>
            </View>
          </View>

          {debugMode ? (
            <View style={styles.panel}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Simulacion de ronda</Text>
                <Text style={styles.mutedText}>{debugRoundPhase.toUpperCase()}</Text>
              </View>
              <Text style={styles.clueLabel}>Pista actual</Text>
              <Text style={styles.clueText}>{debugClue}</Text>

              {debugRoundPhase === 'choose' ? (
                <>
                  <Text style={styles.noticeText}>Elige una carta de tu mano y confirmla para pasar a votacion.</Text>
                  <View style={styles.debugCardRow}>
                    {debugHandCards.map((card) => (
                      <TouchableOpacity key={card.id} style={[styles.debugCard, debugSelectedCard === card.id && styles.debugCardSelected]} onPress={() => setDebugSelectedCard(card.id)}>
                        <Text style={styles.debugCardArt}>{card.art}</Text>
                        <Text style={styles.debugCardTitle}>{card.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={[styles.actionButton, !debugSelectedCard && styles.actionButtonDisabled]} disabled={!debugSelectedCard} onPress={handleDebugPlayCard}>
                    <Text style={styles.actionButtonText}>Confirmar carta</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {debugRoundPhase === 'vote' ? (
                <>
                  <Text style={styles.noticeText}>Los rivales ya han jugado. Elige tu voto.</Text>
                  <View style={styles.debugCardRow}>
                    {debugVotingCards.map((card) => (
                      <TouchableOpacity key={`vote-${card.id}`} style={[styles.debugCard, debugVoteCard === card.id && styles.debugCardVoting]} onPress={() => setDebugVoteCard(card.id)}>
                        <Text style={styles.debugCardArt}>{card.art}</Text>
                        <Text style={styles.debugCardTitle}>{card.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity style={[styles.actionButton, !debugVoteCard && styles.actionButtonDisabled]} disabled={!debugVoteCard} onPress={handleDebugVote}>
                    <Text style={styles.actionButtonText}>Confirmar voto</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {debugRoundPhase === 'score' ? (
                <View style={styles.progressBox}>
                  <Text style={styles.noticeText}>Calculando puntuacion y moviendo jugadores...</Text>
                  <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${debugProgress * 25}%` }]} /></View>
                  <Text style={styles.mutedText}>{Math.max(1, debugProgress)}/4 jugadores resueltos</Text>
                </View>
              ) : null}

              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Comodines</Text>
                <TouchableOpacity style={styles.smallGhostButton} onPress={() => setDebugWildcards((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, value: Math.floor(Math.random() * 3) + 1 }])}>
                  <Text style={styles.smallGhostButtonText}>Generar</Text>
                </TouchableOpacity>
              </View>
              {debugWildcards.length === 0 ? (
                <Text style={styles.helpText}>Todavia no tienes comodines de prueba.</Text>
              ) : (
                <View style={styles.targetList}>
                  {debugWildcards.map((wildcard) => (
                    <TouchableOpacity key={wildcard.id} style={styles.targetButton} onPress={() => applyDebugWildcard(wildcard.id, wildcard.value)}>
                      <Text style={styles.targetButtonText}>Usar +{wildcard.value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Tablero</Text>
            <Text style={styles.helpText}>Si aun no llega el tablero real por socket, se dibuja un tablero mistico de prueba para seguir simulando la partida.</Text>
            <View style={styles.boardGrid}>
              {boardTiles.map((tile: any, index) => {
                const tileIndex = tile.index ?? tile.numero ?? index + 1;
                const tileType = tile.type ?? tile.tipo ?? 'normal';
                const occupants = players.filter((player) => (player.position ?? player.score) === tileIndex);
                const mysticalGlyph =
                  tileType !== 'normal'
                    ? ['✦', '✧', '☽', '✶'][tileIndex % 4]
                    : ['·', '✧', '✦'][tileIndex % 3];
                return (
                  <View key={`${tileIndex}-${index}`} style={[styles.boardTile, tileType !== 'normal' && styles.boardTileSpecial]}>
                    <Text style={styles.boardTileGlyph}>{mysticalGlyph}</Text>
                    <Text style={styles.boardTileText}>{tileIndex}</Text>
                    {occupants.length > 0 ? (
                      <View style={styles.tileOccupants}>
                        {occupants.map((player) => (
                          <View key={player.id} style={[styles.tileBadge, { backgroundColor: (player as { color?: string }).color ?? '#2c3e50' }]}>
                            <Text style={styles.tileBadgeText}>{(player.username ?? player.name ?? player.id).charAt(0).toUpperCase()}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          {pendingScore !== null && activeConflictData && isConflictResolver ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Resolver duelo</Text>
              <Text style={styles.noticeText}>Tu minijuego termino con {pendingScore} puntos. Elige el ganador final.</Text>
              <View style={styles.targetList}>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData.player1)}><Text style={styles.targetButtonText}>Gana {activeConflictData.player1}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.targetButton} onPress={() => resolveConflictWinner(activeConflictData.player2)}><Text style={styles.targetButtonText}>Gana {activeConflictData.player2}</Text></TouchableOpacity>
              </View>
            </View>
          ) : null}

          {activeConflictData && !isParticipant ? (
            <View style={styles.panel}>
              <Text style={styles.sectionLabel}>Duelo en curso</Text>
              <Text style={styles.noticeText}>{activeConflictData.player1} y {activeConflictData.player2} estan resolviendo un conflicto.</Text>
            </View>
          ) : null}
        </ScrollView>

        <DuelMinigameModal
          conflict={showConflictModal ? activeConflictData : null}
          currentUserId={effectiveCurrentUserId}
          onClose={() => setShowConflictModal(false)}
          onResolved={(score) => {
            if (!activeConflictData) return;
            if (isConflictResolver) {
              setPendingScore(score);
              setShowConflictModal(false);
              return;
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(252,238,181,0.2)' },
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
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12 },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerDot: { width: 12, height: 12, borderRadius: 999 },
  playerName: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 16 },
  playerMeta: { color: '#d7dce2', marginTop: 4, fontSize: 12 },
  selfBadge: { color: '#10212e', backgroundColor: '#A8C8C0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontWeight: 'bold' },
  helpText: { color: '#a0b0b9', fontSize: 12, lineHeight: 18 },
  targetList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  targetButton: { backgroundColor: '#A8C8C0', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14 },
  targetButtonText: { color: '#10212e', fontWeight: 'bold' },
  actionButton: { alignSelf: 'flex-start', backgroundColor: '#FCEEB5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  actionButtonDisabled: { opacity: 0.45 },
  actionButtonText: { color: '#10212e', fontWeight: 'bold' },
  clueLabel: { color: '#8caea6', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, fontWeight: 'bold' },
  clueText: { color: '#FCEEB5', fontSize: 28, lineHeight: 34, fontFamily: 'FuenteTitulo' },
  debugCardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  debugCard: { width: 102, minHeight: 132, borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(252,238,181,0.16)', justifyContent: 'space-between' },
  debugCardSelected: { borderColor: '#8fb9ff', backgroundColor: 'rgba(143,185,255,0.18)' },
  debugCardVoting: { borderColor: '#FCEEB5', backgroundColor: 'rgba(252,238,181,0.16)' },
  debugCardArt: { fontSize: 34 },
  debugCardTitle: { color: '#FCEEB5', fontWeight: 'bold', fontSize: 14 },
  progressBox: { gap: 10 },
  progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FCEEB5' },
  smallGhostButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(252,238,181,0.2)' },
  smallGhostButtonText: { color: '#FCEEB5', fontWeight: 'bold' },
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
  },
  tileBadgeText: { color: '#FCEEB5', fontSize: 8, fontWeight: 'bold' },
});
