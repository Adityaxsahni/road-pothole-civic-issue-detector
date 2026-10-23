#!/usr/bin/env node
/**
 * One command, zero infrastructure: embedded PostgreSQL + migrations + demo data + dev server.
 *
 *   npm run demo        → http://localhost:3000
 *
 * Uses DATABASE_URL from .env if it points somewhere other than the embedded database port.
 */
import { execSync, spawn } from "node:child_process";
import { ensureEnvFile, loadEnvFile } from "./lib/env-file.mjs";
import { startLocalDb } from "./local-db.mjs";

ensureEnvFile();
loadEnvFile();

const embeddedPort = process.env.LOCAL_DB_PORT ?? "5433";
const usesEmbedded = (process.env.DATABASE_URL ?? "").includes(`:${embeddedPort}/`);

let pg = null;
if (usesEmbedded) {
  pg = await startLocalDb({ quiet: true });
} else {
  console.log("[demo] DATABASE_URL points to an external database; skipping embedded Postgres");
}

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (pg) {
    console.log("\n[demo] stopping PostgreSQL…");
    await pg.stop().catch(() => {});
  }
  process.exit(code);
}

try {
  run("npx prisma migrate deploy");
  run("npx prisma db seed", { SEED_IF_EMPTY: "true" });
} catch {
  console.error("[demo] database preparation failed");
  await shutdown(1);
}

console.log("\n🚀 Starting CivicPulse at http://localhost:3000\n");
const next = spawn("npx", ["next", "dev", "-p", process.env.PORT ?? "3000"], {
  stdio: "inherit",
  shell: true,
});
next.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
