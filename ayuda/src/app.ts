import cors from 'cors';
import dotenv from 'dotenv';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './api/config/swagger';
import router from './api/routes';

// Cargar variables de entorno
dotenv.config();

const app: Application = express();
const corsOrigin = process.env.CORS_ORIGIN?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// --- Middlewares de Seguridad y Utilidad ---
app.use(helmet()); // Seguridad básica de headers
app.use(corsOrigin?.length ? cors({ origin: corsOrigin }) : cors()); // Configuración de CORS
app.use(morgan('dev')); // Logs de peticiones
app.use(express.json()); // Parsear JSON en el body

// --- Documentación Swagger ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Rutas ---
app.use('/api', router);

// Middleware de manejo de errores global (opcional pero recomendado)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err instanceof Error ? err.stack : err);
  res.status(500).send({ error: 'Algo salió mal en el servidor' });
});

export default app;
