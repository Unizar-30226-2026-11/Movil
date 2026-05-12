// routes/user.routes.ts
import { Router } from 'express';

import {
  createDeck,
  deleteDeck,
  deleteUser,
  getBalance,
  getOwnedCards,
  getProfile,
  getPurchasedBoards,
  getUserDecks,
  searchUsers,
  selectActiveBoard,
  updateDeck,
  updateProfile,
  updateStatus,
} from '../controllers';
import {
  authenticate,
  hasCardsInCollection,
  isBoardOwner,
  isDeckOwner,
  validateDeckBody,
  validateIdParam,
  validateStatusBody,
  validateUsernameBody,
} from '../middlewares';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Obtener el perfil del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario obtenido con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Perfil no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   put:
 *     summary: Actualizar el nombre de usuario (username)
 *     description: Permite al usuario cambiar su nombre público. El nuevo nombre será validado por formato y disponibilidad.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *                 example: nuevo_jugador_99
 *     responses:
 *       200:
 *         description: Nombre de usuario actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Nombre de usuario actualizado.
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Formato de nombre inválido o nombre ya en uso
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
router.get('/profile', getProfile);
router.put('/profile', validateUsernameBody, updateProfile);

/**
 * @swagger
 * /api/users/status:
 *   patch:
 *     summary: Actualizar estado de presencia y privacidad
 *     description: Permite al usuario cambiar su visibilidad ante otros jugadores. El estado "INVISIBLE" permite jugar apareciendo como desconectado para la lista de amigos.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ONLINE, AWAY, BUSY, INVISIBLE]
 *                 description: |
 *                   Estados permitidos:
 *                   - ONLINE: Visible y disponible.
 *                   - AWAY: Ausente temporalmente.
 *                   - BUSY: No molestar (bloqueo de notificaciones).
 *                   - INVISIBLE: Aparece como desconectado.
 *                 example: INVISIBLE
 *     responses:
 *       200:
 *         description: Estado actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ahora tu estado es INVISIBLE
 *                 status:
 *                   type: string
 *                   example: INVISIBLE
 *       400:
 *         description: Estado proporcionado no válido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: No autorizado - Token inválido o ausente
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
router.patch('/status', validateStatusBody, updateStatus);

/**
 * @swagger
 * /api/users:
 *   delete:
 *     summary: Eliminar cuenta de usuario de forma permanente
 *     description: Elimina el perfil del usuario autenticado y realiza una limpieza en cascada de todos sus recursos asociados (mazos, estadísticas y preferencias). Esta acción es irreversible.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario y recursos asociados eliminados correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tu cuenta y todos tus datos han sido eliminados permanentemente.
 *       401:
 *         description: No autorizado - Token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error crítico al intentar eliminar la cuenta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/', deleteUser);

/**
 * @swagger
 * /api/users/balance:
 *   get:
 *     summary: Obtener el balance económico del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance actual del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   example: 1500
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
router.get('/balance', getBalance);

/**
 * @swagger
 * /api/users/search:
 *   get:
 *     summary: Buscar usuarios por nombre
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Texto de búsqueda para encontrar usuarios por nombre
 *         example: jugador
 *     responses:
 *       200:
 *         description: Lista de usuarios que coinciden con la búsqueda
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: u_abc123
 *                       username:
 *                         type: string
 *                         example: jugador42
 *       400:
 *         description: Falta el parámetro de búsqueda
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
router.get('/search', searchUsers);

/**
 * @swagger
 * /api/users/cards:
 *   get:
 *     summary: Obtener las cartas que posee el usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Colección de cartas del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cards:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cardId:
 *                         type: string
 *                         example: col_set1_card_042
 *                       name:
 *                         type: string
 *                         example: Dragón de Fuego
 *                       quantity:
 *                         type: integer
 *                         example: 2
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
router.get('/cards', getOwnedCards);

/**
 * @swagger
 * /api/users/decks:
 *   get:
 *     summary: Obtener los mazos del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de mazos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 decks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: d_xyz789
 *                       name:
 *                         type: string
 *                         example: Mazo Velocidad
 *                       cardIds:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["col_set1_card_001", "col_set1_card_002"]
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
 *     summary: Crear un nuevo mazo para el usuario autenticado
 *     tags: [Users]
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
 *               - cardIds
 *             properties:
 *               name:
 *                 type: string
 *                 example: Mazo Velocidad
 *               cardIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["col_set1_card_001", "col_set1_card_002"]
 *     responses:
 *       201:
 *         description: Mazo creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Mazo creado exitosamente.
 *                 deck:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: d_xyz789
 *                     name:
 *                       type: string
 *                       example: Mazo Velocidad
 *                     cardIds:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Datos del mazo inválidos o cartas no poseídas
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
router.get('/decks', getUserDecks);

// CREAR: 1.Auth -> 2.Formato -> 3.Dueño de cartas -> 4.Controller
router.post('/decks', validateDeckBody, hasCardsInCollection, createDeck);

/**
 * @swagger
 * /api/users/decks/{deckId}:
 *   put:
 *     summary: Actualizar un mazo existente del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deckId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del mazo a actualizar (debe comenzar con "d_")
 *         example: d_xyz789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - cardIds
 *             properties:
 *               name:
 *                 type: string
 *                 example: Mazo Velocidad v2
 *               cardIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["col_set1_card_001", "col_set1_card_005"]
 *     responses:
 *       200:
 *         description: Mazo actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Mazo actualizado.
 *                 deck:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: d_xyz789
 *                     name:
 *                       type: string
 *                       example: Mazo Velocidad v2
 *       400:
 *         description: ID inválido, datos del mazo inválidos o cartas no poseídas
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
 *         description: El mazo no pertenece al usuario autenticado
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
 *   delete:
 *     summary: Eliminar un mazo del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deckId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del mazo a eliminar (debe comenzar con "d_")
 *         example: d_xyz789
 *     responses:
 *       200:
 *         description: Mazo eliminado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Mazo eliminado correctamente.
 *       400:
 *         description: ID de mazo inválido
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
 *         description: El mazo no pertenece al usuario autenticado
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
// ACTUALIZAR: 1.Auth -> 2.Dueño del mazo -> 3.Formato -> 4.Dueño de cartas -> 5.Controller
router.put(
  '/decks/:deckId',
  validateIdParam('deckId'),
  isDeckOwner,
  validateDeckBody,
  hasCardsInCollection,
  updateDeck,
);
router.delete(
  '/decks/:deckId',
  validateIdParam('deckId'),
  isDeckOwner,
  deleteDeck,
);

/**
 * @swagger
 * /api/users/boards:
 *   get:
 *     summary: Obtener los tableros comprados por el usuario autenticado
 *     description: Retorna la lista de todos los tableros que el usuario ha comprado. Incluye información del tablero como id, nombre y descripción.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de tableros comprados obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 boards:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: b_001
 *                       name:
 *                         type: string
 *                         example: Tablero Clásico
 *                       description:
 *                         type: string
 *                         example: El tablero estándar del juego con diseño clásico
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
router.get('/boards', getPurchasedBoards);

/**
 * @swagger
 * /api/users/boards/active:
 *   post:
 *     summary: Seleccionar el tablero activo para las partidas
 *     description: Establece el tablero que se mostrará en todas las partidas del usuario. El tablero debe estar en su lista de tableros comprados.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - boardId
 *             properties:
 *               boardId:
 *                 type: string
 *                 description: ID del tablero a seleccionar
 *                 example: b_001
 *     responses:
 *       200:
 *         description: Tablero seleccionado correctamente como tablero activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tablero seleccionado correctamente.
 *                 activeBoard:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: b_001
 *                     name:
 *                       type: string
 *                       example: Tablero Clásico
 *       400:
 *         description: falta el ID del tablero o es inválido
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
 *         description: El usuario no posee este tablero
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
router.post('/boards/active', isBoardOwner, selectActiveBoard);

export default router;
