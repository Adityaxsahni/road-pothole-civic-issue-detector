// Developer utility: write a synthetic sample photo, e.g. `npx tsx scripts/dev/make-sample.ts pothole 7 out.jpg`.
import { writeFileSync } from "node:fs";
import { renderScene, type SceneKind } from "../../server/media/synthetic";

const [kind = "pothole", seed = "7", out = "sample.jpg"] = process.argv.slice(2);
renderScene(kind as SceneKind, Number(seed)).then((buf) => writeFileSync(out, buf));
