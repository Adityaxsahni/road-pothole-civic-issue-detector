#!/usr/bin/env node
/**
 * Production entrypoint for single-instance hosts (Render, Railway, a VM):
 *   prisma migrate deploy → seed demo data only if the database is empty → start the server.
 *
 *   npm run start:bootstrap
 *
 * Set SKIP_DEMO_SEED=true to start with an empty database (real deployments).
 */
import { execSync } from "node:child_process";
import { loadEnvFile } from "./lib/env-file.mjs";

loadEnvFile();
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

run("npx prisma migrate deploy");
if (process.env.SKIP_DEMO_SEED !== "true") {
  // SEED_IF_EMPTY makes this a no-op once any data exists, so it is safe on every boot.
  run("npx prisma db seed", { SEED_IF_EMPTY: "true", SEED_FORCE: "true" });
}
await import("./start.mjs");
