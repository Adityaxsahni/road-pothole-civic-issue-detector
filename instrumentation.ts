/** Next.js server start hook: enables the in-process maintenance scheduler when configured. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_INTERNAL_SCHEDULER === "true") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
