// routes/friend.routes.ts
import { Router } from 'express';

import {
  getFriends,
  getPendingRequests,
  removeFriend,
  respondToRequest,
  sendRequest,
} from '../controllers';
import {
  authenticate,
  validateIdParam,
  validateRespondRequestBody,
  validateSendRequestBody,
} from '../middlewares';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Obtener la lista de amigos confirmados del usuario autenticado
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de amigos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 friends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: u_abc123
 *                       username:
 *                         type: string
 *                         example: amigo99
 *                       status:
 *                         type: string
 *                         example: online
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', getFriends);

/**
 * @swagger
 * /api/friends/requests:
 *   get:
 *     summary: Obtener las solicitudes de amistad pendientes recibidas
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Solicitudes de amistad pendientes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pendingRequests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: req_def456
 *                       fromUserId:
 *                         type: string
 *                         example: u_abc123
 *                       toUserId:
 *                         type: string
 *                         example: u_xyz789
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   post:
 *     summary: Enviar una solicitud de amistad a otro usuario
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetUserId
 *             properties:
 *               targetUserId:
 *                 type: string
 *                 description: ID del usuario destinatario (debe comenzar con "u_")
 *                 example: u_xyz789
 *     responses:
 *       201:
 *         description: Solicitud de amistad enviada con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Solicitud de amistad enviada con éxito.
 *                 request:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: req_def456
 *                     fromUserId:
 *                       type: string
 *                       example: u_abc123
 *                     toUserId:
 *                       type: string
 *                       example: u_xyz789
 *       400:
 *         description: ID inválido, la solicitud ya existe o ya son amigos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/requests', getPendingRequests);
router.post('/requests', validateSendRequestBody, sendRequest);

/**
 * @swagger
 * /api/friends/requests/{requestId}:
 *   put:
 *     summary: Aceptar o rechazar una solicitud de amistad
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la solicitud de amistad (debe comenzar con "req_")
 *         example: req_def456
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accept, reject]
 *                 example: accept
 *     responses:
 *       200:
 *         description: Solicitud procesada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Solicitud de amistad aceptada. Ahora son amigos.
 *       400:
 *         description: Acción o ID inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No tienes permiso para responder a esta solicitud
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Solicitud de amistad no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put(
  '/requests/:requestId',
  validateIdParam('requestId'),
  validateRespondRequestBody,
  respondToRequest,
); // accept o reject

/**
 * @swagger
 * /api/friends/{friendId}:
 *   delete:
 *     summary: Eliminar un amigo de la lista de amigos
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del amigo a eliminar (debe comenzar con "u_")
 *         example: u_abc123
 *     responses:
 *       200:
 *         description: Amigo eliminado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Amigo eliminado correctamente de tu lista.
 *       400:
 *         description: ID inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:friendId', validateIdParam('friendId'), removeFriend);

export default router;
