import "dotenv/config";
import { env } from "prisma/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: env("DATABASE_URL") })
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : [] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
