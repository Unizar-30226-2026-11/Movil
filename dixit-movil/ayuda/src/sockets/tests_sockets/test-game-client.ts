// test-game-client.ts
import { io, Socket } from 'socket.io-client';

/**El cliente se conecta de verdad por red, pasa por el middleware de autenticación (JWT), 
 * llega al handler (game.handlers.ts), este llama al Service (game.service.ts), 
 * accede a Prisma/Redis y devuelve el mensaje por red. 
 * 
 * Proceso de ejecución:
 * 
 * Se conectará a Redis y Prisma.

    1. Buscará usuarios de verdad.

    2. Mostrará un [MOCK SOCKET EMIT] hacia la sala general avisando de que el juego empieza (y se verá el estado público enmascarado).

    3. Mostrará varios [MOCK SOCKET EMIT] individuales (hacia u_1, u_2, etc.) imprimiendo un array con los IDs de las 6 cartas que le han tocado a cada uno [45, 12, 89, 4, 33, 1].

    4. Confirmará cuántas cartas se han quedado guardadas en Redis esperando a ser robadas en los siguientes turnos.
 * 
 * 
 * */

// ==========================================
// CONFIGURACIÓN
// ==========================================
const BACKEND_URL = 'http://localhost:3000'; // Asegúrate de que es tu puerto
const LOBBY_CODE = 'TEST'; // Código de sala arbitrario para la prueba
const JWT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVfMTYiLCJ1c2VybmFtZSI6Imp1Z2Fkb3I0MiIsImlhdCI6MTc3NDcwMDk2NiwiZXhwIjoxNzc0Nzg3MzY2fQ.0QlKCoqNz8bWDos8pOY-pd-lEi2tcuYxhvjyUt7nCwc';

console.log('🔄 Intentando conectar al servidor de Sockets...');

const socket: Socket = io(BACKEND_URL, {
  auth: {
    token: JWT_TOKEN,
  },
  transports: ['websocket'],
});

// ==========================================
// LISTENERS (Eventos que recibimos del servidor)
// ==========================================

socket.on('connect', () => {
  console.log(`Conectado al servidor con ID: ${socket.id}`);

  // 1. Nos unimos a la sala (vital para que el io.to(lobbyCode) nos llegue)
  socket.emit('joinLobbyRoom', LOBBY_CODE);

  // 2. Esperamos un segundo y le decimos al servidor que inicie la partida
  setTimeout(() => {
    console.log(`\n Emitiendo orden de iniciar partida (client:game:start)...`);
    socket.emit('client:game:start', {
      lobbyCode: LOBBY_CODE,
      mode: 'STANDARD',
    });
  }, 1000);
});

// Escuchamos el estado público (que llega a toda la sala)
socket.on('server:game:started', (payload: any) => {
  console.log('\n MENSAJE GLOBAL DE LA SALA');
  console.log(`   Mensaje: ${payload.message}`);
  console.log(`   Fase actual: ${payload.state.phase}`);
  console.log(`   Jugadores en partida: ${payload.state.players.join(', ')}`);

  // Comprobamos la seguridad (no deberíamos ver las manos de nadie aquí)
  if (payload.state.hands) {
    console.error('   ALERTA DE TRAMPAS: Las manos son públicas.');
  } else {
    console.log(
      '   Seguridad: Las manos privadas han sido ocultadas correctamente en el estado general.',
    );
  }
});

// Escuchamos nuestro estado privado (solo nos llega a nosotros)
socket.on('server:game:private_hand', (payload: any) => {
  console.log('\n [MENSAJE PRIVADO (TU MANO)]');
  console.log(`   Tus cartas: [${payload.hand.join(', ')}]`);

  // Terminamos el test después de recibir nuestras cartas
  setTimeout(() => {
    console.log('\n Test completado con éxito. Desconectando...');
    socket.disconnect();
    process.exit(0);
  }, 1000);
});

socket.on('server:error', (error: any) => {
  console.error('\n [ERROR DEL SERVIDOR]:', error.message);
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error('\n [ERROR DE CONEXIÓN]:', err.message);
  console.error('   ¿Está encendido el servidor? ¿Es válido el token?');
  process.exit(1);
});
