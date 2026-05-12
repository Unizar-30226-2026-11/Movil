// routes/collection.routes.ts
import { Router } from 'express';

import { getCardsByCollection, getCollections } from '../controllers';
import { authenticate, validateIdParam } from '../middlewares';

const router = Router();

// Público o requiere autenticación?
// Lo mantenemos con auth para seguir tu patrón.
router.use(authenticate);

/**
 * @swagger
 * /api/collections:
 *   get:
 *     summary: Obtener todas las colecciones (expansiones y sets) del juego
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de colecciones disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: col_set1
 *                       name:
 *                         type: string
 *                         example: Set Inicial
 *                       description:
 *                         type: string
 *                         example: La colección de inicio que incluye las cartas básicas del juego.
 *                       releaseDate:
 *                         type: string
 *                         format: date
 *                       totalCards:
 *                         type: integer
 *                         example: 100
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
router.get('/', getCollections);

/**
 * @swagger
 * /api/collections/{collectionId}/cards:
 *   get:
 *     summary: Obtener todas las cartas pertenecientes a una colección
 *     tags: [Collections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: collectionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la colección (debe comenzar con "col_")
 *         example: col_set1
 *     responses:
 *       200:
 *         description: Colección y sus cartas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collection:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: col_set1
 *                     name:
 *                       type: string
 *                       example: Set Inicial
 *                 cards:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: col_set1_card_001
 *                       name:
 *                         type: string
 *                         example: Dragón de Fuego
 *                       type:
 *                         type: string
 *                         example: Ataque
 *                       rarity:
 *                         type: string
 *                         example: Rara
 *       400:
 *         description: ID de colección con formato inválido
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
 *       404:
 *         description: Colección no encontrada
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
router.get(
  '/:collectionId/cards',
  validateIdParam('collectionId'),
  getCardsByCollection,
);

export default router;
