/**
 * Prisma 6.x config (replaces the deprecated `package.json#prisma` block; required by Prisma 7).
 * Loads .env so `prisma migrate`/`db seed` see DIRECT_DATABASE_URL exactly like before.
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
