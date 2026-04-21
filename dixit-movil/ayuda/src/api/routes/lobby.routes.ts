// routes/lobby.routes.ts
import { Router } from 'express';

import {
  createLobby,
  getLobbyByCode,
  getPublicLobbies,
  joinLobby,
} from '../controllers';
import { validateCreateLobbyBody, validateIdParam } from '../middlewares';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/lobbies:
 *   post:
 *     summary: Crear una nueva sala de juego
 *     tags: [Lobbies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - maxPlayers
 *               - engine
 *               - isPrivate
 *             properties:
 *               name:
 *                 type: string
 *                 example: Mi Super Partida
 *               maxPlayers:
 *                 type: integer
 *                 minimum: 3
 *                 maximum: 6
 *                 example: 4
 *               engine:
 *                 type: string
 *                 enum: [Classic, Stella]
 *                 example: Classic
 *               isPrivate:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Sala creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Sala creada exitosamente. Listo para conexión WebSocket.
 *                 lobby:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: db_id_12345
 *                     hostId:
 *                       type: string
 *                       example: user_123
 *                     name:
 *                       type: string
 *                       example: Mi Super Partida
 *                     maxPlayers:
 *                       type: integer
 *                       example: 4
 *                     engine:
 *                       type: string
 *                       example: Classic
 *                     isPrivate:
 *                       type: boolean
 *                       example: false
 *                     lobbyCode:
 *                       type: string
 *                       example: QIXQ
 *                     status:
 *                       type: string
 *                       example: waiting
 *                     players:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["user_123"]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-03-02T14:48:00.497Z"
 *       400:
 *         description: Datos de la sala inválidos
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error interno del servidor
 */
router.post('/', validateCreateLobbyBody, createLobby);

/**
 * @swagger
 * /api/lobbies:
 *   get:
 *     summary: Obtener la lista de salas públicas disponibles
 *     tags: [Lobbies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Texto para filtrar salas por nombre
 *         example: Novatos
 *     responses:
 *       200:
 *         description: Lista de salas públicas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lobbies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       lobbyCode:
 *                         type: string
 *                         example: A1B2
 *                       name:
 *                         type: string
 *                         example: Sala de Novatos
 *                       hostId:
 *                         type: string
 *                         example: u_111
 *                       players:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["u_111", "u_222"]
 *                       maxPlayers:
 *                         type: integer
 *                         example: 4
 *                       engine:
 *                         type: string
 *                         example: Classic
 *                       status:
 *                         type: string
 *                         example: waiting
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', getPublicLobbies);

/**
 * @swagger
 * /api/lobbies/{lobbyCode}:
 *   get:
 *     summary: Obtener los detalles de una sala por su código
 *     tags: [Lobbies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lobbyCode
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[A-Z0-9]{4,6}$'
 *         description: Código alfanumérico de la sala (4-6 caracteres)
 *         example: A1B2
 *     responses:
 *       200:
 *         description: Sala encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Sala encontrada.
 *                 lobby:
 *                   type: object
 *                   properties:
 *                     lobbyCode:
 *                       type: string
 *                       example: A1B2
 *                     name:
 *                       type: string
 *                       example: Sala de Novatos
 *                     hostId:
 *                       type: string
 *                       example: u_111
 *                     players:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["u_111", "u_222"]
 *                     maxPlayers:
 *                       type: integer
 *                       example: 4
 *                     engine:
 *                       type: string
 *                       example: Classic
 *                     isPrivate:
 *                       type: boolean
 *                       example: false
 *                     status:
 *                       type: string
 *                       example: waiting
 *       400:
 *         description: Código de sala con formato inválido
 *       403:
 *         description: La sala está llena
 *       404:
 *         description: La sala no existe
 */
router.get('/:lobbyCode', validateIdParam('lobbyCode'), getLobbyByCode);

/**
 * @swagger
 * /api/lobbies/{lobbyCode}/join:
 *   post:
 *     summary: Solicitar acceso a una sala y obtener el token de WebSocket
 *     tags: [Lobbies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lobbyCode
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[A-Z0-9]{4,6}$'
 *         description: Código alfanumérico de la sala (4-6 caracteres)
 *         example: A1B2
 *     responses:
 *       200:
 *         description: Token de conexión WebSocket generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ticket de conexión WebSocket generado exitosamente.
 *                 wsToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 lobbyCode:
 *                   type: string
 *                   example: A1B2
 *       400:
 *         description: Código de sala con formato inválido
 *       403:
 *         description: La sala está llena
 *       404:
 *         description: La sala no existe
 *       500:
 *         description: Error interno del servidor
 */
router.post('/:lobbyCode/join', validateIdParam('lobbyCode'), joinLobby);

export default router;
