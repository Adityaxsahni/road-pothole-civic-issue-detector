import sharp from "sharp";

/**
 * Deterministic synthetic street-scene generator used for demo seed data and tests, so the
 * repository ships without binary photo fixtures. Scenes are stylised but carry the visual
 * cues real photos have (asphalt texture, dark cavities, thin cracks, water, debris).
 */

export type SceneKind =
  | "pothole"
  | "road-crack"
  | "water-leak"
  | "blocked-drain"
  | "trash"
  | "fallen-sign"
  | "broken-streetlight"
  | "open-manhole"
  | "clean-road";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blobPath(cx: number, cy: number, rx: number, ry: number, rand: () => number, jitter = 0.28): string {
  const n = 14;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 1 - jitter / 2 + rand() * jitter;
    return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r] as const;
  });
  const mid = (i: number) => {
    const [x1, y1] = pts[i % n];
    const [x2, y2] = pts[(i + 1) % n];
    return [(x1 + x2) / 2, (y1 + y2) / 2] as const;
  };
  let d = `M ${mid(0)[0].toFixed(1)} ${mid(0)[1].toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const [px, py] = pts[i % n];
    const [mx, my] = mid(i);
    d += ` Q ${px.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return `${d} Z`;
}

const W = 640;
const H = 480;

function asphalt(seed: number, tone = "#77736d"): string {
  return `
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="${seed % 1000}"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.32"/></feComponentTransfer>
    </filter>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfe0ee"/><stop offset="1" stop-color="#e9eef2"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${tone}"/>
  <rect width="${W}" height="110" fill="url(#sky)"/>
  <polygon points="0,110 ${W},110 ${W},${H} 0,${H}" fill="${tone}"/>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>`;
}

function laneMarks(rand: () => number): string {
  const x = 300 + rand() * 40;
  return [0, 1, 2, 3]
    .map((i) => {
      const y = 130 + i * 95;
      const w = 6 + i * 4;
      return `<rect x="${x - w / 2 + (i - 1.5) * 6}" y="${y}" width="${w}" height="${36 + i * 10}" fill="#ece7da" opacity="0.85"/>`;
    })
    .join("");
}

export function sceneSvg(kind: SceneKind, seed: number): string {
  const rand = mulberry32(seed * 7919 + kind.length);
  const parts: string[] = [];
  let tone = "#77736d";
  if (kind === "broken-streetlight") tone = "#2d2f36";
  parts.push(asphalt(seed, tone));
  if (kind !== "broken-streetlight") parts.push(laneMarks(rand));

  switch (kind) {
    case "pothole": {
      const cx = 200 + rand() * 240;
      const cy = 300 + rand() * 100;
      const rx = 70 + rand() * 90;
      const ry = rx * (0.45 + rand() * 0.2);
      parts.push(`<path d="${blobPath(cx, cy, rx * 1.12, ry * 1.15, rand)}" fill="#5c5853"/>`);
      parts.push(`<path d="${blobPath(cx, cy, rx, ry, rand)}" fill="#26241f"/>`);
      parts.push(
        `<path d="${blobPath(cx - rx * 0.1, cy + ry * 0.1, rx * 0.55, ry * 0.5, rand)}" fill="#1a1915"/>`,
      );
      break;
    }
    case "open-manhole": {
      const cx = 260 + rand() * 120;
      const cy = 320 + rand() * 60;
      parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="92" ry="46" fill="#4b4a47"/>`);
      parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="78" ry="38" fill="#0e0e0d"/>`);
      break;
    }
    case "road-crack": {
      for (let c = 0; c < 4; c++) {
        let x = 80 + rand() * 480;
        let y = 160 + rand() * 60;
        let d = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
        for (let i = 0; i < 14; i++) {
          x += (rand() - 0.5) * 70;
          y += 12 + rand() * 18;
          d += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
        }
        parts.push(
          `<path d="${d}" stroke="#1f1d1a" stroke-width="${3 + rand() * 3}" fill="none" stroke-linejoin="round"/>`,
        );
      }
      break;
    }
    case "water-leak": {
      const cx = 320 + (rand() - 0.5) * 160;
      parts.push(`<path d="${blobPath(cx, 340, 230, 95, rand, 0.2)}" fill="#3f7fb8" opacity="0.92"/>`);
      parts.push(`<path d="${blobPath(cx + 30, 330, 120, 40, rand, 0.3)}" fill="#7fb3dd" opacity="0.8"/>`);
      break;
    }
    case "blocked-drain": {
      parts.push(`<rect x="230" y="330" width="180" height="70" rx="6" fill="#262624"/>`);
      for (let i = 0; i < 8; i++)
        parts.push(`<rect x="${240 + i * 21}" y="336" width="8" height="58" fill="#55524c"/>`);
      parts.push(`<path d="${blobPath(320, 380, 250, 80, rand, 0.25)}" fill="#476f8f" opacity="0.85"/>`);
      for (let i = 0; i < 14; i++) {
        const hue = Math.floor(rand() * 360);
        parts.push(
          `<rect x="${200 + rand() * 240}" y="${330 + rand() * 90}" width="${10 + rand() * 24}" height="${8 + rand() * 16}" fill="hsl(${hue},70%,50%)" transform="rotate(${rand() * 90} 320 360)"/>`,
        );
      }
      break;
    }
    case "trash": {
      for (let i = 0; i < 60; i++) {
        const hue = Math.floor(rand() * 360);
        const x = 120 + rand() * 400;
        const y = 220 + rand() * 230;
        const s = 14 + rand() * 40;
        parts.push(
          `<rect x="${x}" y="${y}" width="${s}" height="${s * (0.5 + rand())}" rx="4" fill="hsl(${hue},${60 + rand() * 30}%,${40 + rand() * 20}%)" transform="rotate(${rand() * 80 - 40} ${x} ${y})"/>`,
        );
      }
      break;
    }
    case "fallen-sign": {
      const x = 220 + rand() * 120;
      parts.push(
        `<rect x="${x - 150}" y="380" width="260" height="10" fill="#9ba1a6" transform="rotate(-8 ${x} 385)"/>`,
      );
      parts.push(
        `<polygon points="${x},300 ${x + 70},420 ${x - 70},420" fill="#ffffff" stroke="#d62d20" stroke-width="16" transform="rotate(${60 + rand() * 40} ${x} 370)"/>`,
      );
      break;
    }
    case "broken-streetlight": {
      parts.push(`<rect x="300" y="60" width="14" height="420" fill="#4d4f55"/>`);
      parts.push(`<rect x="250" y="56" width="110" height="18" rx="6" fill="#3d3f45"/>`);
      parts.push(`<ellipse cx="270" cy="80" rx="22" ry="8" fill="#1d1e22"/>`);
      break;
    }
    case "clean-road":
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

export async function renderScene(
  kind: SceneKind,
  seed: number,
  format: "jpeg" | "png" = "jpeg",
): Promise<Buffer> {
  const img = sharp(Buffer.from(sceneSvg(kind, seed)));
  return format === "png" ? img.png().toBuffer() : img.jpeg({ quality: 82 }).toBuffer();
}
