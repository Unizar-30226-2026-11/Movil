// src/sockets/socket-auth.middleware.ts
import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';

// Extendemos la interfaz del Socket
export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    username: string;
  };
  // socket.data ya existe en Socket.io, pero tipamos lo que vamos a guardar
  data: {
    lobbyCode?: string;
    [key: string]: any;
  };
}

export const authenticateSocket = (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
) => {
  try {
    // El cliente envía el wsToken en el handshake
    let token = socket.handshake.auth?.token;

    // --- PLAN B PARA POSTMAN ---
    // Si no está en el auth, lo buscamos en los headers
    if (!token && socket.handshake.headers['authorization']) {
      token = socket.handshake.headers['authorization'].split(' ')[1]; // Extraemos el JWT quitando la palabra "Bearer "
    }

    if (!token) {
      return next(new Error('Autenticación denegada: wsToken ausente'));
    }

    const secretKey = process.env.JWT_SECRET || 'super_secret_fallback_key';

    // Verificamos la firma y expiración del wsToken (2 min)
    const decodedPayload = jwt.verify(token, secretKey) as {
      id: string;
      username: string;
      lobbyCode: string; // <-- Viene del LobbyController
    };

    // Guardamos los datos validados en el socket
    socket.user = {
      id: decodedPayload.id,
      username: decodedPayload.username,
    };

    // ¡Clave de seguridad! El lobbyCode es inmutable y dictado por el token
    socket.data.lobbyCode = decodedPayload.lobbyCode;

    next();
  } catch (error) {
    return next(
      new Error('Autenticación denegada: Ticket inválido o expirado'),
    );
  }
};
