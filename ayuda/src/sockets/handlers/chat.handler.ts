// src/sockets/handlers/chat.handler.ts
import { Server } from 'socket.io';
import { z } from 'zod';

import { CLIENT_EVENTS, SERVER_EVENTS } from '../events';
import {
  ChatMessageReceivedPayload,
  ChatSendPayload,
  ErrorPayload,
} from '../events/types';
import { AuthenticatedSocket } from '../middleware/socket-auth.middleware';

const ChatMessageSchema = z.object({
  lobbyCode: z.string().length(4),
  text: z.string().min(1).max(255),
});

export const registerChatHandlers = (
  io: Server,
  socket: AuthenticatedSocket,
) => {
  // 1. Usamos la constante estricta en lugar de 'sendChatMessage'
  socket.on(CLIENT_EVENTS.CHAT_SEND, (payload: unknown) => {
    const result = ChatMessageSchema.safeParse(payload);

    if (!result.success) {
      const errorPayload: ErrorPayload = {
        message: 'Formato de mensaje inválido',
      };
      socket.emit(SERVER_EVENTS.ERROR, errorPayload); // Usamos constante de error
      return;
    }

    // Gracias al Zod y a la interfaz, sabemos seguro qué es "data"
    const { lobbyCode, text } = result.data as ChatSendPayload;
    const username = socket.user?.username || 'Usuario Desconocido';

    // 2. Preparamos la respuesta tipada
    const responsePayload: ChatMessageReceivedPayload = {
      username,
      text,
      timestamp: new Date().toISOString(),
    };

    // 3. Emitimos usando la constante estricta del servidor
    io.to(lobbyCode).emit(SERVER_EVENTS.CHAT_MESSAGE_RECEIVED, responsePayload);
  });
};
