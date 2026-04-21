// test-full-flow.ts
/**
 * Simula una ronda completa de Dixit STANDARD con 4 jugadores socket.
 *
 * Flujo:
 *   CONECTAR×4 → JOIN_LOBBY×4 → START_GAME
 *   → STORYTELLING (SEND_STORY)
 *   → SUBMISSION  (SUBMIT_CARD × 3 no-storytellers)
 *   → VOTING      (CAST_VOTE  × 3 no-storytellers)
 *   → SCORING     (NEXT_ROUND)
 *   → STORYTELLING 2 ← test finaliza aquí
 *
 * EJECUCIÓN:
 *   cd Backend && npx ts-node src/sockets/tests_sockets/test-full-flow.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';

import { prisma } from '../../infrastructure/prisma';
import { connectRedis } from '../../infrastructure/redis';
import { LobbyRedisRepository } from '../../repositories/lobby.repository';

const BACKEND_URL = 'http://localhost:3000';
const LOBBY_CODE = 'FLOW';
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_fallback_key';
const FAKE_IDS = ['u_901', 'u_902', 'u_903'];
const USE_DYNAMIC_POOL = false; // <-- Cambia a true para usar los mazos de los usuarios (mezcla) o false para usar una colección al azar

// ─── Estado global compartido entre listeners ─────────────────────────────────
const sockets: Record<string, Socket> = {};
const hands: Record<string, number[]> = {};
const playedCards: Record<string, number> = {}; // playerId → cardId enviada

let storytellerId: string = '';
let currentPhase: string = '';
let boardCards: number[] = [];

// Guards para evitar enviar la misma acción varias veces
let storySent = false;
let scoringHandled = false;
let gameFinished = false;
const submittedSet = new Set<string>();
const votedSet = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeToken(id: string, username: string): string {
  return jwt.sign({ id, username, lobbyCode: LOBBY_CODE }, SECRET_KEY, {
    expiresIn: '10m',
  });
}

function emit(
  pid: string,
  actionType: string,
  payload: Record<string, unknown> = {},
): void {
  const data = { lobbyCode: LOBBY_CODE, actionType, payload };
  console.log(
    `\n [${pid}] → client:game:action "${actionType}"`,
    JSON.stringify(payload),
  );
  sockets[pid].emit('client:game:action', data);
}

function separator(label: string): void {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(50));
}

// ─── Lógica de fase ───────────────────────────────────────────────────────────
function onPhaseChange(allIds: string[], hostId: string): void {
  separator(`NUEVA FASE: ${currentPhase}`);

  switch (currentPhase) {
    // ── STORYTELLING ──────────────────────────────────────────────────────────
    case 'STORYTELLING': {
      if (gameFinished) return; // segunda STORYTELLING = fin del test

      // Puede que llegue antes o después de private_hand; intentar ahora y
      // también desde private_hand cuando se reciba
      tryStory();
      break;
    }

    // ── SUBMISSION ────────────────────────────────────────────────────────────
    case 'SUBMISSION': {
      const nonST = allIds.filter((id) => id !== storytellerId);
      console.log(
        `\n   Non-storytellers que deben enviar carta: ${nonST.join(', ')}`,
      );

      nonST.forEach((pid, i) => {
        if (submittedSet.has(pid)) return;
        submittedSet.add(pid);
        const hand = hands[pid] ?? [];
        if (!hand.length) {
          console.log(`⚠️  [${pid}] sin cartas para SUBMIT_CARD`);
          return;
        }
        const cardId = hand[0];
        playedCards[pid] = cardId;
        setTimeout(() => emit(pid, 'SUBMIT_CARD', { cardId }), i * 200);
      });
      break;
    }

    // ── VOTING ────────────────────────────────────────────────────────────────
    case 'VOTING': {
      const nonST = allIds.filter((id) => id !== storytellerId);
      console.log(`\n   boardCards disponibles: [${boardCards.join(', ')}]`);
      console.log(`   Non-storytellers que deben votar: ${nonST.join(', ')}`);

      nonST.forEach((pid, i) => {
        if (votedSet.has(pid)) return;
        votedSet.add(pid);
        const myCard = playedCards[pid];
        const cardToVote =
          boardCards.find((c) => c !== myCard) ?? boardCards[0];
        setTimeout(
          () => emit(pid, 'CAST_VOTE', { cardId: cardToVote }),
          i * 200,
        );
      });
      break;
    }

    // ── SCORING ───────────────────────────────────────────────────────────────
    case 'SCORING': {
      if (scoringHandled) return;
      scoringHandled = true;
      console.log('\n   Avanzando a siguiente ronda...');
      setTimeout(() => emit(hostId, 'NEXT_ROUND', {}), 300);
      break;
    }
  }
}

// Disparar SEND_STORY cuando tengamos storytellerId y su mano
function tryStory(): void {
  if (storySent) return;
  if (!storytellerId) return;
  const hand = hands[storytellerId];
  if (!hand?.length) return; // todavía no llegó private_hand

  storySent = true;
  const cardId = hand[0];
  console.log(
    `\nSTORYTELLER = ${storytellerId} → SEND_STORY carta=${cardId} pista="El cielo infinito"`,
  );
  emit(storytellerId, 'SEND_STORY', { cardId, clue: 'El cielo infinito' });
}

// ─── Listeners por socket ─────────────────────────────────────────────────────
function attachListeners(pid: string, allIds: string[], hostId: string): void {
  const s = sockets[pid];

  // server:game:started → llega a la room FLOW tras START
  s.on('server:game:started', (payload: any) => {
    const state = payload?.state ?? {};
    const st = state.currentRound?.storytellerId;
    if (st) storytellerId = st;
    currentPhase = state.phase ?? currentPhase;

    // Solo logueamos en detalle desde el host para no duplicar
    if (pid !== hostId) return;
    separator('server:game:started');
    console.log(`   phase         : ${state.phase}`);
    console.log(`   players       : ${state.players?.join(', ')}`);
    console.log(`   storytellerID : ${storytellerId}`);
    console.log(`   scores        : ${JSON.stringify(state.scores)}`);
  });

  // server:game:private_hand → llega al room del userId
  s.on('server:game:private_hand', (payload: any) => {
    hands[pid] = payload?.hand ?? [];
    console.log(`\n[${pid}] private_hand: [${hands[pid].join(', ')}]`);

    // Si esperábamos la mano del storyteller para enviar la historia
    if (pid === storytellerId && currentPhase === 'STORYTELLING') {
      tryStory();
    }
  });

  // server:game:state_updated → llega a la room FLOW en cada acción
  s.on('server:game:state_updated', (payload: any) => {
    const state = payload?.state ?? {};
    const round = state.currentRound ?? {};
    const st = round.storytellerId;
    const newPh = state.phase;

    // Actualizar estado global
    if (st) storytellerId = st;
    if (round.boardCards?.length) boardCards = round.boardCards;
    if (round.playedCards) Object.assign(playedCards, round.playedCards);

    // Loguear solo desde el host para no repetir 4 veces
    if (pid === hostId) {
      console.log(
        `\n📊 [state_updated] lastAction=${payload.lastAction} | phase: ${currentPhase} → ${newPh}`,
      );
      console.log(`   storytellerID : ${storytellerId}`);
      console.log(`   scores        : ${JSON.stringify(state.scores)}`);
      if (round.clue) console.log(`   clue          : "${round.clue}"`);
      if (round.boardCards?.length)
        console.log(`   boardCards    : [${round.boardCards.join(', ')}]`);
      if (round.playedCards)
        console.log(`   playedCards   : ${JSON.stringify(round.playedCards)}`);
      if (round.votes?.length)
        console.log(`   votes         : ${JSON.stringify(round.votes)}`);
    }

    const prevPhase = currentPhase;
    currentPhase = newPh;

    // Reaccionar al cambio de fase; solo hace falta que UN socket lo procese
    if (pid === hostId && newPh !== prevPhase) {
      // Segunda STORYTELLING = ronda terminada
      if (newPh === 'STORYTELLING' && prevPhase === 'SCORING') {
        gameFinished = true;
        separator(' RONDA COMPLETA');
        console.log(`   Nuevo storytellerID : ${storytellerId}`);
        console.log(
          `   Puntuaciones        : ${JSON.stringify(state.scores, null, 2)}`,
        );
        setTimeout(() => {
          allIds.forEach((id) => sockets[id]?.disconnect());
          process.exit(0);
        }, 500);
        return;
      }
      onPhaseChange(allIds, hostId);
    }
  });

  s.on('server:game:special_event', (ev: any) => {
    console.log(`\n [${pid}] special_event: ${JSON.stringify(ev)}`);
  });

  s.on('server:error', (err: any) => {
    console.error(
      `\n [${pid}] server:error: ${err?.message ?? JSON.stringify(err)}`,
    );
  });

  s.on('disconnect', (reason: string) => {
    console.log(`\n [${pid}] desconectado: ${reason}`);
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────
async function setup(): Promise<{
  hostId: string;
  allIds: string[];
  tokens: Record<string, string>;
}> {
  console.log(' Conectando bases de datos...');
  await connectRedis();

  const user = await prisma.user.findFirst({
    where: { my_deck: { some: {} } },
    select: { id_user: true, username: true },
  });
  if (!user) throw new Error('No hay usuarios con mazos en la BD.');

  const hostId = `u_${user.id_user}`;
  const allIds = [hostId, ...FAKE_IDS];

  console.log(` Host: ${user.username} (${hostId})`);
  console.log(`   Todos los jugadores: ${allIds.join(', ')}`);

  const tokens: Record<string, string> = {
    [hostId]: makeToken(hostId, user.username),
  };
  FAKE_IDS.forEach((id) => {
    tokens[id] = makeToken(id, id);
  });

  // Inyectar lobby en Redis
  await LobbyRedisRepository.save(LOBBY_CODE, {
    lobbyCode: LOBBY_CODE,
    hostId,
    name: 'Test Full Flow',
    maxPlayers: 6,
    engine: 'STANDARD',
    isPrivate: false,
    status: 'waiting',
    players: allIds,
  });
  console.log(`✅ Lobby "${LOBBY_CODE}" inyectado con 4 jugadores.`);

  return { hostId, allIds, tokens };
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function runTest(): Promise<void> {
  try {
    const { hostId, allIds, tokens } = await setup();

    // 1. Crear y conectar todos los sockets
    console.log('\n Cnectando sockets...');
    await Promise.all(
      allIds.map(
        (pid) =>
          new Promise<void>((resolve, reject) => {
            const s = io(BACKEND_URL, {
              auth: { token: tokens[pid] },
              transports: ['websocket'],
            });
            sockets[pid] = s;
            attachListeners(pid, allIds, hostId);
            s.on('connect', () => {
              console.log(` [${pid}] conectado (socketId=${s.id})`);
              resolve();
            });
            s.on('connect_error', (err) => {
              console.error(` [${pid}] connect_error: ${err.message}`);
              reject(err);
            });
          }),
      ),
    );

    // 2. Todos los jugadores hacen JOIN al lobby
    //    → El handler llama socket.join(lobbyCode), sin esto no reciben eventos de room
    console.log('\n🔗 Todos haciendo client:lobby:join...');
    allIds.forEach((pid) => {
      sockets[pid].emit('client:lobby:join', { lobbyCode: LOBBY_CODE });
    });
    await new Promise((r) => setTimeout(r, 500)); // dar tiempo al servidor

    // 3. Host inicia la partida
    separator('client:lobby:start');
    sockets[hostId].emit('client:lobby:start', {
      useDynamicPool: USE_DYNAMIC_POOL,
    });

    if (USE_DYNAMIC_POOL) {
      console.log('\n Usando mazos dinámicos (mezcla de colecciones)...');
    } else {
      console.log('\n Usando mazos predefinidos (colección aleatoria)...');
    }

    // 4. Esperar repartición de manos (max 8s por jugador)
    console.log('\n Esperando repartición de manos privadas...');
    await Promise.all(
      allIds.map(
        (pid) =>
          new Promise<void>((resolve) => {
            if ((hands[pid] ?? []).length > 0) {
              resolve();
              return;
            }
            sockets[pid].once('server:game:private_hand', () => resolve());
            setTimeout(resolve, 8000);
          }),
      ),
    );
    console.log('\n Todas las manos recibidas.');
    allIds.forEach((pid) =>
      console.log(`   [${pid}]: [${(hands[pid] ?? []).join(', ')}]`),
    );

    // 5. Si el storyteller ya es conocido y la fase es STORYTELLING, disparar
    if (currentPhase === 'STORYTELLING' && !storySent) {
      tryStory();
    }

    // ─────────────────────────────────────────────────────────────────
    // PRUEBA DE DESCONEXIÓN, RECONEXIÓN Y MULTITAB
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- INICIANDO PRUEBA DE DESCONEXIÓN Y RECONEXIÓN ---');

    const testPlayerId = FAKE_IDS[0]; // Escogemos al primer jugador de prueba
    const oldSocket = sockets[testPlayerId];

    // 1. Simulamos que al jugador se le cae el internet (F5 o cierre)
    console.log(
      `[Reconexión] Desconectando físicamente el socket de ${testPlayerId}...`,
    );
    oldSocket.disconnect();

    // Esperamos un poco para que el servidor procese la caída del socket
    await new Promise((r) => setTimeout(r, 1500));

    // 2. Simulamos la reconexión
    console.log(
      `[Reconexión] Reconectando a ${testPlayerId} simulando que hizo /refresh-session...`,
    );

    // Creamos un NUEVO socket usando el mismo token
    // (En la vida real, aquí el frontend usaría el wsToken devuelto por /refresh-session)
    const reconnectedSocket = io(BACKEND_URL, {
      auth: oldSocket.auth, // Reutilizamos el token de autenticación
    });

    // Actualizamos nuestra referencia global en el test
    sockets[testPlayerId] = reconnectedSocket;

    // 3. Escuchamos el evento de recuperación
    reconnectedSocket.on('server:session:recovered', (data) => {
      console.log(`\n✅ ¡ÉXITO! Sesión recuperada para ${testPlayerId}`);
      console.log(`   -> Sala recuperada: ${data.lobbyCode}`);
      console.log(`   -> Fase del juego recuperada: ${data.state.phase}`);
      console.log(
        `   -> Storyteller: ${data.state.currentRound.storytellerId}`,
      );
    });

    // 4. (Opcional) Prueba rápida de Multitab (intentar conectar otra vez)
    setTimeout(() => {
      console.log(
        `\n[Multitab] Intentando abrir una segunda pestaña para ${testPlayerId}...`,
      );
      const evilMultitabSocket = io(BACKEND_URL, { auth: oldSocket.auth });

      evilMultitabSocket.on('connect', () => {
        console.log(' Multitab: Segunda pestaña conectada con éxito.');
      });

      evilMultitabSocket.on('disconnect', () => {
        console.log(' Multitab: Segunda pestaña desconectada.');
      });

      // Si funciona bien nuestro backend, el reconnectedSocket debería recibir force_disconnect
      reconnectedSocket.on('server:force_disconnect', (data) => {
        console.log(
          `🚨 ¡MULTITAB DETECTADO Y BLOQUEADO! Mensaje: "${data.message}"`,
        );
      });
    }, 3000);

    // Esperamos unos segundos para ver los logs de los eventos
    await new Promise((r) => setTimeout(r, 5000));
    // ─────────────────────────────────────────────────────────────────
  } catch (err) {
    console.error(' Error en el test:', err);
    process.exit(1);
  }
}

runTest();
