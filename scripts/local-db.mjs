#!/usr/bin/env node
/**
 * Zero-install PostgreSQL for local development (no Docker required).
 * Downloads nothing at runtime: binaries come from the `embedded-postgres` npm package.
 *
 *   npm run db:start          # foreground; Ctrl+C to stop
 *
 * Data lives in ./.data/pg. Connection: postgresql://civicpulse:civicpulse@localhost:5433/civicpulse
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const dataDir = path.resolve(process.env.LOCAL_DB_DIR ?? ".data/pg");

export async function startLocalDb({ quiet = false } = {}) {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "civicpulse",
    password: "civicpulse",
    port: PORT,
    persistent: true,
    onLog: quiet ? () => {} : (msg) => process.stdout.write(`[postgres] ${msg}`),
    onError: (msg) => process.stderr.write(`[postgres] ${msg}\n`),
  });

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`[db] initialising new cluster in ${dataDir}`);
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("civicpulse");
    console.log("[db] created database 'civicpulse'");
  } catch {
    // Database already exists.
  }
  console.log(`[db] PostgreSQL ready on postgresql://civicpulse:civicpulse@localhost:${PORT}/civicpulse`);
  return pg;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const pg = await startLocalDb({ quiet: true });
  const stop = async () => {
    console.log("\n[db] stopping…");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // Keep the process alive.
  setInterval(() => {}, 1 << 30);
}
