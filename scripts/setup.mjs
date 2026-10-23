#!/usr/bin/env node
/**
 * Prepare a database you already run (Docker, managed Postgres, or `npm run db:start`):
 *   .env → prisma generate → migrate deploy → seed demo data (only if empty).
 *
 *   npm run setup
 */
import { execSync } from "node:child_process";
import { ensureEnvFile, loadEnvFile } from "./lib/env-file.mjs";

ensureEnvFile();
loadEnvFile();

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

try {
  run("npx prisma generate");
  run("npx prisma migrate deploy");
  run("npx prisma db seed", { SEED_IF_EMPTY: "true" });
  console.log("\n✅ Setup complete. Start the app with: npm run dev\n");
} catch {
  console.error(
    "\n❌ Setup failed. Is PostgreSQL reachable at DATABASE_URL?\n" +
      "   • No Docker? Run `npm run db:start` in another terminal (or use `npm run demo`).\n" +
      "   • Docker: `docker compose up -d db` and set DATABASE_URL to port 5432.\n",
  );
  process.exit(1);
}
