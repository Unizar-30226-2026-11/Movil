# 🔌 Documentación de la Arquitectura de Sockets

> Referencia técnica para el equipo de **Frontend**
>
> Stack: **Socket.IO** sobre Node.js + Express · Persistencia: **Redis OM** · Cola de trabajos: **BullMQ**

---

## 1. Visión General de la Arquitectura

```
Cliente (Browser)
      │
      │  WebSocket (Socket.IO)
      ▼
┌─────────────────────────────────────────────────────┐
│  Middleware: authenticateSocket                     │
│  → Valida el JWT (wsToken) en el handshake         │
│  → Inyecta socket.user  { id, username }           │
│  → Inyecta socket.data  { lobbyCode? }             │
└───────────────────────┬─────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │   setupSockets()   │  ← punto de entrada único
              │  (handlers/index)  │
              └──────┬──────┬──────┘
                     │      │
          ┌──────────▼──┐  ┌▼────────────────┐
          │ Lógica de   │  │  Registro de     │
          │ Conexión    │  │  Handlers        │
          │ (multitab,  │  │  ┌─────────────┐ │
          │  reconex.)  │  │  │ LobbyHandler│ │
          └─────────────┘  │  ├─────────────┤ │
                           │  │  GameHandler│ │
                           │  ├─────────────┤ │
                           │  │  ChatHandler│ │
                           │  └─────────────┘ │
                           └──────────────────┘
                                    │
                             ┌──────▼──────┐
                             │  GameService │
                             │  (lógica)    │
                             └──────┬───────┘
                                    │
                        ┌───────────▼────────────┐
                        │  GameRedisRepository    │
                        │  (persistencia Redis)   │
                        └─────────────────────────┘
                                    │
                        ┌───────────▼────────────┐
                        │    BullMQ Worker        │
                        │  (timeouts automáticos) │
                        └─────────────────────────┘
```

El servidor corre en: **`http://localhost:3000`**

---

## 2. Autenticación — Middleware JWT

Toda conexión WebSocket pasa por `authenticateSocket` **antes** de llegar a cualquier handler.

### Cómo conectarse desde el Frontend

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: '<wsToken>'   // ← JWT obtenido del endpoint HTTP de login/refresh-session
  },
  transports: ['websocket']
});
```

### Payload decodificado del JWT

| Campo        | Tipo              | Descripción                                              |
|--------------|-------------------|----------------------------------------------------------|
| `id`         | `string`          | ID del usuario (`"u_123"`)                              |
| `username`   | `string`          | Nombre de usuario visible                               |
| `lobbyCode`  | `string \| null`  | Código de sala (4 caracteres). `null` si no hay lobby   |

> ⚠️ **IMPORTANTE:** Si el `wsToken` está ausente, ha expirado o tiene firma inválida, el servidor rechaza la conexión y el socket **nunca llega a conectarse**.

---

## 3. Ciclo de Vida de la Conexión

### Al conectarse (`connection`)

El servidor ejecuta automáticamente:

1. **Control multipestaña**: Si el mismo `userId` ya tiene socket activo, desconecta el antiguo y le emite `server:force_disconnect`.
2. **Une al jugador a su sala personal** — `socket.join(userId)` — para eventos privados.
3. **Auto-reconexión**: Si el JWT contiene `lobbyCode`:
   - Si hay **partida en curso** → emite `server:session:recovered`
   - Si hay **lobby activo** sin partida → emite `server:lobby:recovered`

### Al desconectarse (`disconnect`)

El socket se elimina del mapa en memoria, pero **Redis NO se toca**. Una desconexión accidental (F5, pérdida de red) no destruye la sesión; el jugador puede reconectarse con el mismo JWT.

---

## 4. Sistema de Salas (Rooms)

| Room        | Contenido                              | Cuándo se usa                                      |
|-------------|----------------------------------------|----------------------------------------------------|
| `lobbyCode` | Todos los sockets del mismo lobby      | Eventos de lobby y eventos públicos del juego      |
| `userId`    | Solo el socket de ese jugador          | Mano de cartas, reconexión, duelo                  |

---

## 5. Handlers

### 5.1 `LobbyHandler` — `registerLobbyHandlers`
Gestiona la sala de espera previa a la partida.
**Escucha:** `client:lobby:join` · `client:lobby:leave` · `client:lobby:start` · `disconnect`

### 5.2 `GameHandler` — `registerGameHandlers`
Canal único de acciones durante la partida + mini-juego Estrella Fugaz.
Usa el patrón **acción tipada**: un solo evento con un campo `actionType` discriminador.
**Escucha:** `client:game:action` · `client:game:trigger_star` · `client:game:claim_star`

### 5.3 `ChatHandler` — `registerChatHandlers`
Chat en tiempo real dentro del lobby/partida.
**Escucha:** `client:chat:send`

---

## 6. Eventos: Cliente → Servidor

### `client:lobby:join`
El jugador entra en la sala de espera.
**Payload:** _(ninguno)_

```js
socket.emit('client:lobby:join');
```

**Respuesta del servidor:** `server:lobby:state_updated` → a toda la sala.

---

### `client:lobby:leave`
El jugador abandona voluntariamente el lobby.
**Payload:** _(ninguno)_

```js
socket.emit('client:lobby:leave');
```

---

### `client:lobby:start`
El host solicita iniciar la partida.
**Payload:** _(ninguno)_

**Validaciones:**
- Solo el `hostId` del lobby puede emitirlo
- Mínimo **4 jugadores** (`LOBBY_MIN_PLAYERS`)

**Respuesta del servidor (éxito):**
- `server:game:started` → toda la sala (estado público)
- `server:game:private_hand` → a cada jugador individualmente (su mano)

```js
socket.emit('client:lobby:start');
```

---

### `client:game:action`
**Canal único** para todas las acciones del juego durante la partida.

**Payload:**
```ts
{
  lobbyCode: string;      // Código de 4 caracteres
  actionType: string;     // Discriminador de la acción
  payload?: object;       // Datos específicos (ver tabla)
}
```

**Tabla de `actionType`:**

| `actionType`          | Fase requerida     | `payload`                              | Quién                        |
|-----------------------|--------------------|----------------------------------------|------------------------------|
| `SEND_STORY`          | `STORYTELLING`     | `{ cardId: number, clue: string }`     | Solo el Storyteller          |
| `SUBMIT_CARD`         | `SUBMISSION`       | `{ cardId: number }`                   | Cualquier no-storyteller     |
| `CAST_VOTE`           | `VOTING`           | `{ cardId: number }`                   | Cualquier no-storyteller     |
| `NEXT_ROUND`          | `SCORING`          | _(ninguno)_                            | Cualquier jugador (host rec.)|
| `RESOLVE_DUEL`        | Tras casilla duelo | `{ targetId: string }`                 | Jugador que cayó la casilla  |
| `CHANGE_MODE`         | Pre-partida        | `{ mode: 'STANDARD' \| 'STELLA' }`    | Solo host                    |
| `STELLA_SUBMIT_MARKS` | `STELLA_MARKING`   | `{ cardIds: number[] }`                | Cada jugador                 |
| `STELLA_REVEAL_MARK`  | `STELLA_REVEAL`    | `{ cardId: number }`                   | Scout actual (`currentScoutId`) |

```js
// Storyteller manda su historia
socket.emit('client:game:action', {
  lobbyCode: 'ABCD',
  actionType: 'SEND_STORY',
  payload: { cardId: 42, clue: 'El cielo infinito' }
});

// No-storyteller envía su carta
socket.emit('client:game:action', {
  lobbyCode: 'ABCD',
  actionType: 'SUBMIT_CARD',
  payload: { cardId: 17 }
});

// No-storyteller vota
socket.emit('client:game:action', {
  lobbyCode: 'ABCD',
  actionType: 'CAST_VOTE',
  payload: { cardId: 17 }
});
```

---

### `client:game:trigger_star`
Activa la Estrella Fugaz.
**Payload:** `{ lobbyCode: string }`

```js
socket.emit('client:game:trigger_star', { lobbyCode: 'ABCD' });
```

---

### `client:game:claim_star`
El jugador clica la estrella para reclamar la recompensa.
**Payload:** `{ lobbyCode: string }`

El **primer** jugador en enviar este evento gana **+3 puntos**.

```js
socket.emit('client:game:claim_star', { lobbyCode: 'ABCD' });
```

---

### `client:chat:send`
Envía un mensaje al chat de la sala.
**Payload:**
```ts
{
  lobbyCode: string;  // 4 caracteres
  text: string;       // min 1, max 255 caracteres
}
```

```js
socket.emit('client:chat:send', { lobbyCode: 'ABCD', text: '¡Vamos!' });
```

---

## 7. Eventos: Servidor → Cliente

### `server:error`
Error de validación o lógica de negocio.
**Destino:** Solo el socket que causó el error.

```ts
{ message: string; code?: string }
```

```js
socket.on('server:error', ({ message }) => showErrorToast(message));
```

---

### `server:lobby:state_updated`
El lobby cambió (alguien entró o salió).
**Destino:** Room `lobbyCode`

```ts
{
  lobbyCode: string;
  hostId: string;
  name: string;
  maxPlayers: number;
  engine: 'STANDARD' | 'STELLA';
  isPrivate: boolean;
  status: 'waiting' | 'playing';
  players: string[];   // Array de userIds
}
```

---

### `server:game:started`
La partida ha comenzado. Llega **una sola vez**.
**Destino:** Room `lobbyCode`

```ts
{
  message: string;          // '¡La partida ha comenzado!'
  state: PublicGameState;
}
```

```js
socket.on('server:game:started', ({ state }) => {
  console.log('Fase:', state.phase);              // 'STORYTELLING'
  console.log('Storyteller:', state.currentRound.storytellerId);
  navigateToGameBoard(state);
});
```

---

### `server:game:private_hand`
La mano privada del jugador.
**Destino:** Room `userId` (solo ese jugador)

```ts
{ hand: number[] }   // Array de IDs de cartas
```

> ⚠️ Llega en múltiples momentos: inicio de partida, tras NEXT_ROUND, tras efecto SHUFFLE, al reconectarse. **Actualizar siempre** al recibirlo.

```js
socket.on('server:game:private_hand', ({ hand }) => renderMyHand(hand));
```

---

### `server:game:state_updated`
El estado público del juego cambió.
**Destino:** Room `lobbyCode`

```ts
{
  state: PublicGameState;
  lastAction: string;    // ej: 'SEND_STORY', 'CAST_VOTE'
}
```

**`PublicGameState` (modo STANDARD):**
```ts
{
  lobbyCode: string;
  mode: 'STANDARD';
  phase: 'STORYTELLING' | 'SUBMISSION' | 'VOTING' | 'SCORING' | 'FINISHED';
  status: 'playing' | 'finished';
  players: string[];
  disconnectedPlayers: string[];
  winners?: string[];
  scores: Record<string, number>;
  currentRound: {
    storytellerId: string;
    clue: string | null;
    storytellerCardId: number | null;
    playedCards: Record<string, number>;   // { userId: cardId }
    boardCards: number[];
    votes: Array<{ voterId: string; targetCardId: number }>;
  };
  isStarActive: boolean;
  starExpiresAt: number;
  boardRegistry: Record<number, string[]>;
  activeModifiers: Record<string, { type: 'HAND_LIMIT'; value: number; turnsLeft: number }>;
  // ⚠️ hands, centralDeck y discardPile NO están (son privados)
}
```

**`PublicGameState` (modo STELLA):**
```ts
{
  lobbyCode: string;
  mode: 'STELLA';
  phase: 'STELLA_WORD_REVEAL' | 'STELLA_MARKING' | 'STELLA_REVEAL' | 'SCORING' | 'FINISHED';
  status: 'playing' | 'finished';
  players: string[];
  disconnectedPlayers: string[];
  scores: Record<string, number>;
  currentRound: {
    word: string | null;
    boardCards: number[];           // Siempre 15 cartas
    playerMarks: Record<string, number[]>;
    revealedCards: number[];
    currentScoutId: string | null;
    fallenPlayers: string[];
    inTheDarkPlayerId: string | null;
    roundScores: Record<string, number>;
    successfulMarks: Record<string, number>;
  };
}
```

---

### `server:game:special_event`
Un jugador aterrizó en una casilla especial.
**Destino:** Room `lobbyCode`

```ts
{
  effect: 'ODD' | 'EVEN' | 'EQUILIBRIUM' | 'SHUFFLE' | 'CARD_BONUS' | 'STELLA_BONUS_PLACEHOLDER';
  pId?: string;      // userId afectado
  points?: number;   // Puntos ganados/perdidos (ODD, EVEN)
  squareId?: number; // Número de la casilla (ODD, EVEN)
  amount?: number;   // Modificador de cartas (CARD_BONUS, negativo = penalización)
  message?: string;  // Mensaje descriptivo (STELLA_BONUS_PLACEHOLDER)
}
```

```js
socket.on('server:game:special_event', (ev) => {
  switch (ev.effect) {
    case 'ODD':
    case 'EVEN':
      showToast(`${ev.pId}: ${ev.points > 0 ? '+' : ''}${ev.points} pts (casilla ${ev.squareId})`);
      break;
    case 'EQUILIBRIUM':
      showToast('¡Equilibrio! Todos avanzan por posición en el ranking');
      break;
    case 'SHUFFLE':
      showToast(`${ev.pId} cambió toda su mano`);
      break;
    case 'CARD_BONUS':
      showToast(`${ev.pId}: ${ev.amount > 0 ? '+' : ''}${ev.amount} cartas por 2 rondas`);
      break;
  }
});
```

---

### `server:game:duel_available`
El jugador puede elegir rival para el duelo.
**Destino:** Room `userId` — SOLO el jugador que cayó en la casilla

```ts
{ challengerId: string }
```

```js
socket.on('server:game:duel_available', ({ challengerId }) => {
  showDuelModal();
  // Cuando elige rival:
  socket.emit('client:game:action', {
    lobbyCode: 'ABCD',
    actionType: 'RESOLVE_DUEL',
    payload: { targetId: '<userId del rival>' }
  });
});
```

---

### `server:game:deck_reshuffled`
El mazo central se agotó y se reconstruyó con los descartes.
**Destino:** Room `lobbyCode`
**Payload:** `{}` (objeto vacío)

---

### `star_spawned`
Una estrella fugaz ha aparecido.
**Destino:** Room `lobbyCode`

```ts
{
  starId: string;         // ej: 'star_1712580000000'
  path: {
    start: { x: number; y: number };   // % pantalla (0–100)
    end:   { x: number; y: number };
  };
  duration: number;       // Milisegundos de vida (2000–4000 ms)
}
```

```js
socket.on('star_spawned', ({ path, duration }) => {
  animateStar(path, duration);
  // El primero en clicar emite client:game:claim_star
});
```

---

### `star_claimed`
Alguien capturó la estrella.
**Destino:** Room `lobbyCode`

```ts
{
  winnerId: string;
  newScores: Record<string, number>;   // Puntuaciones con el +3 aplicado
}
```

---

### `server:chat:message_received`
Nuevo mensaje de chat.
**Destino:** Room `lobbyCode`

```ts
{
  username: string;
  text: string;
  timestamp: string;   // ISO 8601
}
```

---

### `server:session:recovered`
Reconexión a partida en curso.
**Destino:** Room `userId`

```ts
{
  lobbyCode: string;
  state: PublicGameState;
}
```

> 💡 Tras este evento llegará automáticamente `server:game:private_hand` con la mano del jugador.

---

### `server:lobby:recovered`
Reconexión a lobby activo (partida aún no empezó).
**Destino:** Room `userId`

```ts
{
  lobbyCode: string;
  lobby: LobbyState;
}
```

---

### `server:force_disconnect`
El servidor desconecta esta sesión (multipestaña detectada).
**Destino:** Room `userId` — el socket **antiguo** lo recibe.

```ts
{ message: string }
```

```js
// ⚠️ Siempre registrar este listener:
socket.on('server:force_disconnect', ({ message }) => {
  alert(message);
  redirectToHome();
});
```

---

## 8. Máquina de Estados — STANDARD (Dixit)

```
START ──► STORYTELLING ──(SEND_STORY)──► SUBMISSION ──(SUBMIT_CARD ×n)──► VOTING
                                                                              │
                                              STORYTELLING ◄──(NEXT_ROUND)── SCORING
                                              (nueva ronda)                   │
                                                                           FINISHED
                                                                    (si alguien ≥ 42 pts)
```

**Timeouts automáticos (BullMQ Worker):**

| Fase          | Timeout | Acción automática                                  |
|---------------|---------|----------------------------------------------------|
| STORYTELLING  | 60 s    | Juega carta aleatoria como Storyteller (AFK)       |
| SUBMISSION    | 45 s    | Juega carta aleatoria por cada jugador AFK         |
| VOTING        | 45 s    | Vota aleatoriamente por cada jugador AFK           |
| SCORING       | 10 s    | Llama `NEXT_ROUND` automáticamente                 |

---

## 9. Máquina de Estados — STELLA

```
START ──► STELLA_WORD_REVEAL
               │
           STELLA_MARKING   (STELLA_SUBMIT_MARKS ×todos)
               │
           STELLA_REVEAL    (STELLA_REVEAL_MARK, turno a turno)
               │
            SCORING ──► FINISHED  (si alguien ≥ 30 pts)
               │
           STELLA_WORD_REVEAL (nueva ronda)
```

---

## 10. Tablero — Casillas Especiales

`MAX_SCORE = 42` (meta del tablero)

| Pos | Tipo            | Efecto                                                        |
|-----|-----------------|---------------------------------------------------------------|
| 5   | IMPAR           | 1er jugador: +1 · 2º: -1 · 3º: +2 · 4º: -2 · …             |
| 7   | PAR             | 1er jugador: -1 · 2º: +1 · 3º: -2 · 4º: +2 · …             |
| 9   | IMPAR           | Igual que pos 5                                              |
| 11  | PAR             | Igual que pos 7                                              |
| 15  | Bonus Aleatorio | ±(1-3) cartas en mano durante 2 rondas                       |
| 18  | Shuffle         | Descartas toda tu mano y robas nuevas cartas                  |
| 21  | Bonus Aleatorio | Igual que pos 15                                             |
| 25  | Duelo           | Reta a un rival – Servidor emite `server:game:duel_available` |
| 27  | Equilibrio ★    | Cada jugador +N puntos según su posición en el ranking       |
| 31  | Bonus Aleatorio | Igual que pos 15                                             |
| 34  | Shuffle         | Igual que pos 18                                             |
| 37  | Bonus Aleatorio | Igual que pos 15                                             |
| 40  | Duelo           | Igual que pos 25                                             |
| 42  | META 🏁          | `phase → FINISHED`                                           |

> Las casillas IMPAR/PAR solo cuentan la **primera vez** que pasa cada jugador.

---

## 11. Todas las Constantes de Eventos

```ts
// Cliente → Servidor
const CLIENT_EVENTS = {
  LOBBY_JOIN:    'client:lobby:join',
  LOBBY_LEAVE:   'client:lobby:leave',
  LOBBY_START:   'client:lobby:start',
  GAME_ACTION:   'client:game:action',
  TRIGGER_STAR:  'client:game:trigger_star',
  CLAIM_STAR:    'client:game:claim_star',
  CHAT_SEND:     'client:chat:send',
};

// Servidor → Cliente
const SERVER_EVENTS = {
  ERROR:                  'server:error',
  FORCE_DISCONNECT:       'server:force_disconnect',
  LOBBY_STATE_UPDATED:    'server:lobby:state_updated',
  LOBBY_RECOVERED:        'server:lobby:recovered',
  GAME_STARTED:           'server:game:started',
  GAME_STATE_UPDATED:     'server:game:state_updated',
  PRIVATE_HAND:           'server:game:private_hand',
  SPECIAL_EVENT:          'server:game:special_event',
  DUEL_AVAILABLE:         'server:game:duel_available',
  DECK_RESHUFFLED:        'server:game:deck_reshuffled',
  GAME_ENDED:             'server:game:ended',
  STAR_SPAWNED:           'star_spawned',
  STAR_CLAIMED:           'star_claimed',
  CHAT_MESSAGE_RECEIVED:  'server:chat:message_received',
  SESSION_RECOVERED:      'server:session:recovered',
};
```

---

## 12. Checklist de Integración — Frontend

```
✅ Conectar con auth.token = wsToken
✅ Registrar server:force_disconnect ANTES de cualquier otra lógica
✅ Emitir client:lobby:join al entrar a la pantalla del lobby
✅ Escuchar server:game:private_hand en CUALQUIER fase (se actualiza sin aviso)
✅ Detectar la fase en server:game:state_updated y renderizar el UI correspondiente
✅ Mostrar botón "Iniciar" solo si lobby.players.length >= 4 Y userId === hostId
✅ Escuchar server:session:recovered para reconectar sin perder estado
✅ Manejar star_spawned / star_claimed para el mini-juego Estrella Fugaz
✅ No usar socket.id como identificador — usar siempre el userId del JWT
```

---

## 13. Notas Finales

- **`hands`, `centralDeck` y `discardPile`** no están en el estado público por seguridad.
  La mano propia llega únicamente por `server:game:private_hand` en la sala privada del jugador.
- Los **timeouts de fase son automáticos**. El Worker juega por los jugadores AFK. No implementar reintentos desde el Frontend.
- **Redis no se toca en desconexión**. Una caída de red no destruye la partida. Al reconectarse con el mismo JWT, el estado se recupera automáticamente.
- El único namespace usado es el **default** (`/`). No hay namespaces separados para lobby, game o chat.
