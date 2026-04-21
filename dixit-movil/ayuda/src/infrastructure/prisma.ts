import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

// 2. Inicializamos el adaptador
const adapter = new PrismaPg(pool);

// Evita que en desarrollo se creen múltiples instancias de Prisma al recargar el código
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ['query'], // Opcional: para ver las consultas en consola
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
