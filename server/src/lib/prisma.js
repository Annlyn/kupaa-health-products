import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

// `node --watch` re-imports modules; reuse the client so we don't leak connections.
if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;
