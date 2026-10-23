import "server-only";
import { runMaintenance } from "./services/maintenance";

const DEFAULT_INTERVAL_MIN = 15;
let started = false;

/**
 * In-process maintenance scheduler for long-running servers (Docker, Render, Railway), so no
 * external cron service is needed. Serverless platforms should use /api/cron/recompute instead.
 */
export function startScheduler() {
  if (started) return;
  started = true;
  const minutes = Math.max(1, Number(process.env.SCHEDULER_INTERVAL_MIN) || DEFAULT_INTERVAL_MIN);
  const tick = async () => {
    try {
      const { results } = await runMaintenance();
      console.info(
        `[scheduler] maintenance done: ${results.map((r) => `${r.municipality} hotspots=${r.hotspots} priorities=${r.priorities}`).join("; ")}`,
      );
    } catch (err) {
      console.error("[scheduler] maintenance failed", err);
    }
  };
  // First run shortly after boot, then on a fixed interval.
  setTimeout(tick, 30_000).unref();
  setInterval(tick, minutes * 60_000).unref();
  console.info(`[scheduler] maintenance every ${minutes} min`);
}
