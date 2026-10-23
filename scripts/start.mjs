#!/usr/bin/env node
/**
 * Run the production build locally (`npm run build && npm start`).
 *
 * Next's standalone server needs the static assets (and sharp's native libraries) copied beside it, and it chdirs into its own
 * folder — so relative paths such as UPLOAD_DIR are resolved against the project root first.
 * (The Docker image does the copy at build time and runs `node server.js` directly.)
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "./lib/env-file.mjs";

const standalone = path.resolve(".next/standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(".next/static", path.join(standalone, ".next/static"), { recursive: true });
cpSync("public", path.join(standalone, "public"), { recursive: true });
// Output tracing copies sharp's .node binding but not the libvips shared libraries beside it.
for (const pkg of ["sharp", "@img"]) {
  cpSync(path.join("node_modules", pkg), path.join(standalone, "node_modules", pkg), { recursive: true });
}

loadEnvFile();
process.env.UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "storage/uploads");
process.env.NODE_ENV = "production";

const server = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: process.env,
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
