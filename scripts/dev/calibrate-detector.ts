// Developer utility: print CivicVision-Lite predictions for every synthetic scene type.
import { HeuristicDetector } from "../../server/ai/heuristic";
import { renderScene, type SceneKind } from "../../server/media/synthetic";

const kinds: SceneKind[] = [
  "pothole",
  "open-manhole",
  "road-crack",
  "water-leak",
  "blocked-drain",
  "trash",
  "fallen-sign",
  "broken-streetlight",
  "clean-road",
];

async function main() {
  const detector = new HeuristicDetector();
  for (const kind of kinds) {
    const labels: string[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const out = await detector.detect(await renderScene(kind, seed));
      labels.push(`${out.label}(${out.confidence.toFixed(2)})`);
      if (seed === 1 && process.argv.includes("--verbose")) console.log(kind, out.raw);
    }
    console.log(kind.padEnd(20), labels.join(" "));
  }
}
main();
