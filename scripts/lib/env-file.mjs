import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/** Create .env from .env.example on first run, replacing placeholder secrets with random values. */
export function ensureEnvFile() {
  if (existsSync(".env")) return false;
  copyFileSync(".env.example", ".env");
  const content = readFileSync(".env", "utf8")
    .replace("change-me-to-a-long-random-string", randomBytes(32).toString("base64"))
    .replace("change-me-cron-secret", randomBytes(18).toString("hex"));
  writeFileSync(".env", content);
  console.log("[setup] created .env with fresh secrets");
  return true;
}

/** Minimal .env parser (KEY="value" lines) so scripts can read config without extra deps. */
export function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
