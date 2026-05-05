// routes/shop.routes.ts
import { Router } from 'express';

import { buyItem, getShopItems } from '../controllers';
import { authenticate } from '../middlewares';
import { checkItemNotOwned, validateBuyItemBody } from '../middlewares';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/shop/items:
 *   get:
 *     summary: Obtener el catálogo de artículos disponibles en la tienda
 *     tags: [Shop]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de artículos disponibles en la tienda
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: item_wildcard_001
 *                       name:
 *                         type: string
 *                         example: Comodín de ataque
 *                       description:
 *                         type: string
 *                         example: Permite cambiar las cartas de ataque una vez por partida.
 *                       type:
 *                        type: string
 *                        example: thematic_deck
 *                       price:
 *                         type: number
 *                         example: 200
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
router.get('/items', getShopItems);

/**
 * @swagger
 * /api/shop/buy:
 *   post:
 *     summary: Comprar un artículo de la tienda
 *     tags: [Shop]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *             properties:
 *               itemId:
 *                 type: string
 *                 description: ID del artículo a comprar
 *                 example: item_wildcard_001
 *     responses:
 *       200:
 *         description: Artículo comprado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Has comprado 'Comodín de ataque' exitosamente."
 *                 updatedBalance:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                       example: user_123
 *                     coins:
 *                       type: integer
 *                       example: 500
 *                     gems:
 *                       type: integer
 *                       example: 50
 *       400:
 *         description: itemId inválido o el usuario ya posee el artículo
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
 *         description: Saldo insuficiente para realizar la compra
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Saldo insuficiente.
 *                 required:
 *                   type: number
 *                   example: 200
 *                 currentBalance:
 *                   type: number
 *                   example: 50
 *       404:
 *         description: Artículo no encontrado en el catálogo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Hay una transacción en curso, reintentar más tarde
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error interno en la transacción
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/buy',
  validateBuyItemBody, // ¿El ID del item es válido y viene en el body?
  checkItemNotOwned, // ¿El usuario ya tiene este item? (Evita compras duplicadas)
  buyItem, // Controller: Realizar la transacción
);

export default router;
