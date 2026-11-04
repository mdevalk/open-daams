import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 CLI config (db push, generate, studio, seed). The CLI no longer
// loads .env itself, hence dotenv here; the app's own client (src/lib/db.ts)
// gets DATABASE_URL from Next.js's env loading instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
