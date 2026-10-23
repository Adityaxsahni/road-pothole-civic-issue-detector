/**
 * Demo seed: one city (Bengaluru), neighbourhoods, teams, staff and citizens, ~280 reports with
 * synthetic photos analysed by the real detector, chronological deduplication, realistic status
 * histories, priorities, hotspots and 90 days of analytics snapshots.
 *
 * Run with `npm run db:seed` (wipes existing data). Refuses to run in production unless
 * SEED_FORCE=true.
 */
import {
  PrismaClient,
  type Prisma,
  type ReportStatus,
  type RoadType,
  type TrafficLevel,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { CATEGORICAL, NEUTRAL_SERIES } from "../lib/constants";
import { classifyDuplicate, findBestDuplicate, type DedupCandidate } from "../lib/dedup";
import { nearestNeighborhood } from "../lib/geo";
import { generateRefCode } from "../lib/ref-code";
import { computeSeverity } from "../lib/scoring";
import { HeuristicDetector } from "../server/ai/heuristic";
import type { DetectionOutput } from "../server/ai/types";
import { processImage } from "../server/media/process";
import { mulberry32, renderScene, type SceneKind } from "../server/media/synthetic";
import { storage } from "../server/storage";
import { snapshotDays } from "../server/services/analytics";
import { recomputeHotspots } from "../server/services/hotspots";
import { recomputeOpenPriorities, recomputeReportPriority } from "../server/services/priority";

const prisma = new PrismaClient();
const rand = mulberry32(20261023);
const DEMO_PASSWORD = "Password123!";
const DAY = 86_400_000;
const HOUR = 3_600_000;

const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
function weighted<T extends string>(table: Record<T, number>): T {
  const entries = Object.entries(table) as Array<[T, number]>;
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
}
const gaussian = () => {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};
/** Offset a point by a random distance (metres, normal-distributed with sigma). */
function jitter(lat: number, lng: number, sigmaM: number) {
  const dLat = (gaussian() * sigmaM) / 111_320;
  const dLng = (gaussian() * sigmaM) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { latitude: lat + dLat, longitude: lng + dLng };
}

/* ───────────────────────────── Reference data ───────────────────────────── */

const CATEGORIES = [
  {
    slug: "pothole",
    name: "Pothole",
    icon: "construction",
    baseSeverity: 68,
    slaHours: 72,
    group: "road",
    description: "Holes or depressions in the road surface",
  },
  {
    slug: "road-crack",
    name: "Road crack",
    icon: "split",
    baseSeverity: 42,
    slaHours: 240,
    group: "road",
    description: "Cracking, ravelling or broken asphalt",
  },
  {
    slug: "blocked-drain",
    name: "Blocked drain",
    icon: "waves",
    baseSeverity: 55,
    slaHours: 72,
    group: "water",
    description: "Clogged storm-water drains or flooding",
  },
  {
    slug: "water-leak",
    name: "Water leak",
    icon: "droplets",
    baseSeverity: 58,
    slaHours: 48,
    group: "water",
    description: "Burst pipes or leaking water mains",
  },
  {
    slug: "trash",
    name: "Garbage dumping",
    icon: "trash",
    baseSeverity: 34,
    slaHours: 96,
    group: "sanitation",
    description: "Illegal dumping or overflowing bins",
  },
  {
    slug: "fallen-sign",
    name: "Fallen sign",
    icon: "signpost",
    baseSeverity: 48,
    slaHours: 96,
    group: "street-furniture",
    description: "Damaged or missing traffic signage",
  },
  {
    slug: "broken-streetlight",
    name: "Broken streetlight",
    icon: "lightbulb",
    baseSeverity: 44,
    slaHours: 120,
    group: "street-furniture",
    description: "Street lights out or flickering",
  },
  {
    slug: "open-manhole",
    name: "Open manhole",
    icon: "alert",
    baseSeverity: 88,
    slaHours: 12,
    group: "road",
    description: "Missing or broken manhole covers",
  },
  {
    slug: "other",
    name: "Other",
    icon: "help",
    baseSeverity: 30,
    slaHours: 168,
    group: "other",
    description: "Anything else affecting public spaces",
  },
] as const;
type CategorySlug = (typeof CATEGORIES)[number]["slug"];

const SCENE_FOR: Record<CategorySlug, SceneKind> = {
  pothole: "pothole",
  "road-crack": "road-crack",
  "blocked-drain": "blocked-drain",
  "water-leak": "water-leak",
  trash: "trash",
  "fallen-sign": "fallen-sign",
  "broken-streetlight": "broken-streetlight",
  "open-manhole": "open-manhole",
  other: "clean-road",
};

const NEIGHBORHOODS = [
  { name: "Koramangala", lat: 12.9352, lng: 77.6245 },
  { name: "Indiranagar", lat: 12.9784, lng: 77.6408 },
  { name: "Whitefield", lat: 12.9698, lng: 77.75 },
  { name: "Jayanagar", lat: 12.925, lng: 77.5938 },
  { name: "HSR Layout", lat: 12.9116, lng: 77.6474 },
  { name: "Malleshwaram", lat: 13.0035, lng: 77.571 },
  { name: "Electronic City", lat: 12.8452, lng: 77.6602 },
  { name: "Hebbal", lat: 13.0358, lng: 77.597 },
  { name: "Marathahalli", lat: 12.9591, lng: 77.6974 },
  { name: "BTM Layout", lat: 12.9166, lng: 77.6101 },
  { name: "Yelahanka", lat: 13.1007, lng: 77.5963 },
  { name: "Rajajinagar", lat: 12.991, lng: 77.5525 },
  { name: "MG Road", lat: 12.9756, lng: 77.605 },
];

const TEAMS = [
  {
    name: "Road Maintenance – East",
    specialties: ["pothole", "road-crack", "open-manhole"],
    color: CATEGORICAL[0],
    description: "Patching, resurfacing and manhole repairs",
  },
  {
    name: "Road Maintenance – West",
    specialties: ["pothole", "road-crack", "open-manhole"],
    color: CATEGORICAL[6],
    description: "Patching and resurfacing crews (west zones)",
  },
  {
    name: "Storm Water Drains",
    specialties: ["blocked-drain", "water-leak"],
    color: CATEGORICAL[2],
    description: "Desilting, drainage and leak response",
  },
  {
    name: "Solid Waste Management",
    specialties: ["trash"],
    color: CATEGORICAL[4],
    description: "Clean-up drives and dumping enforcement",
  },
  {
    name: "Street Lighting & Signage",
    specialties: ["broken-streetlight", "fallen-sign", "other"],
    color: CATEGORICAL[1],
    description: "Lighting and street furniture",
  },
];

/** Hotspot corridors where reports concentrate (chronic problem areas). */
const HOTSPOTS: Array<{ hood: string; category: CategorySlug; weight: number; offset: [number, number] }> = [
  { hood: "Marathahalli", category: "pothole", weight: 5, offset: [0.002, -0.004] },
  { hood: "Koramangala", category: "pothole", weight: 4, offset: [-0.003, 0.002] },
  { hood: "Whitefield", category: "pothole", weight: 3, offset: [0.004, 0.001] },
  { hood: "HSR Layout", category: "blocked-drain", weight: 3, offset: [0.001, 0.003] },
  { hood: "Hebbal", category: "pothole", weight: 3, offset: [-0.002, -0.002] },
  { hood: "BTM Layout", category: "trash", weight: 3, offset: [0.002, 0.002] },
  { hood: "Electronic City", category: "road-crack", weight: 2, offset: [0.003, -0.003] },
  { hood: "Indiranagar", category: "water-leak", weight: 2, offset: [-0.001, 0.003] },
  { hood: "Jayanagar", category: "broken-streetlight", weight: 2, offset: [0.002, -0.001] },
];

const TEXT: Record<CategorySlug, Array<[string, string]>> = {
  pothole: [
    [
      "Deep pothole in left lane",
      "A deep pothole about a metre wide in the left lane. Two-wheelers are swerving into traffic to avoid it.",
    ],
    [
      "Pothole near bus stop",
      "Large pothole right before the bus stop, filled with water after rain so its depth is hidden.",
    ],
    [
      "Series of potholes on main road",
      "Several potholes in a row over roughly 50 metres. Cars are braking hard at night.",
    ],
    ["Pothole at junction", "Pothole in the middle of the junction, causing slowdowns during peak hours."],
  ],
  "road-crack": [
    [
      "Wide cracks across carriageway",
      "Alligator cracking across the full width of the road, starting to break apart.",
    ],
    ["Road surface breaking up", "Asphalt is ravelling with loose gravel collecting along the edge."],
  ],
  "blocked-drain": [
    [
      "Drain clogged with silt and plastic",
      "Storm-water drain is completely blocked; road floods after even light rain.",
    ],
    [
      "Waterlogging due to blocked inlet",
      "The drain inlet is covered with debris and water has stood here for two days.",
    ],
  ],
  "water-leak": [
    [
      "Water pipe leaking onto road",
      "Clean water gushing from a broken pipe since morning, flowing down the street.",
    ],
    ["Burst water main", "Water bubbling up through the road surface near the footpath."],
  ],
  trash: [
    [
      "Garbage dumped on footpath",
      "Large pile of mixed waste dumped on the footpath; it is spreading onto the road.",
    ],
    [
      "Overflowing garbage point",
      "Collection point has not been cleared for days. Stray animals are scattering waste.",
    ],
  ],
  "fallen-sign": [
    [
      "Traffic sign knocked down",
      "The speed-limit sign has been knocked over and is lying across the footpath.",
    ],
    ["Missing stop sign", "The stop sign at this junction is bent to the ground and not visible to drivers."],
  ],
  "broken-streetlight": [
    [
      "Streetlights out on entire stretch",
      "Four streetlights in a row are not working; the stretch is completely dark at night.",
    ],
    ["Flickering streetlight", "Streetlight flickers on and off all night near the park entrance."],
  ],
  "open-manhole": [
    [
      "Open manhole on road",
      "Manhole cover is missing in the middle of the road. Extremely dangerous at night.",
    ],
    ["Broken manhole cover", "Manhole cover is cracked and sinking; a vehicle wheel could fall in."],
  ],
  other: [
    [
      "Encroachment blocking footpath",
      "Construction material is blocking the entire footpath, forcing pedestrians onto the road.",
    ],
    ["Damaged road divider", "Road divider is broken with exposed rods sticking out."],
  ],
};

const CITIZENS = [
  ["Ananya Rao", "citizen@civicpulse.dev"],
  ["Rahul Menon", "rahul.menon@example.com"],
  ["Priya Shetty", "priya.shetty@example.com"],
  ["Arjun Nair", "arjun.nair@example.com"],
  ["Kavya Iyer", "kavya.iyer@example.com"],
  ["Vikram Reddy", "vikram.reddy@example.com"],
  ["Sneha Kulkarni", "sneha.k@example.com"],
  ["Mohammed Irfan", "irfan.m@example.com"],
  ["Deepa Gowda", "deepa.gowda@example.com"],
  ["Karthik S", "karthik.s@example.com"],
  ["Fatima Khan", "fatima.khan@example.com"],
  ["Rohan Das", "rohan.das@example.com"],
] as const;

/* ───────────────────────────── Seed ───────────────────────────── */

async function wipe() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.storedFile.deleteMany(),
    prisma.analyticsSummary.deleteMany(),
    prisma.hotspotCluster.deleteMany(),
    prisma.teamAssignment.deleteMany(),
    prisma.statusLog.deleteMany(),
    prisma.detectionResult.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.report.updateMany({ data: { duplicateOfId: null, duplicateGroupId: null } }),
    prisma.duplicateGroup.deleteMany(),
    prisma.report.deleteMany(),
    prisma.user.deleteMany(),
    prisma.team.deleteMany(),
    prisma.neighborhood.deleteMany(),
    prisma.issueCategory.deleteMany(),
    prisma.municipality.deleteMany(),
  ]);
}

interface PooledImage {
  storageKey: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  phash: string;
  detection: DetectionOutput;
}

async function buildImagePool(): Promise<Map<SceneKind, PooledImage[]>> {
  const store = storage();
  if (store.name === "local") {
    await rm(path.join(path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads"), "seed"), {
      recursive: true,
      force: true,
    });
  }
  const detector = new HeuristicDetector();
  const pool = new Map<SceneKind, PooledImage[]>();
  const kinds = [...new Set(Object.values(SCENE_FOR))];
  for (const kind of kinds) {
    const items: PooledImage[] = [];
    for (let variant = 1; variant <= 6; variant++) {
      const img = await processImage(await renderScene(kind, variant * 31 + kind.length));
      const key = `seed/${kind}-${variant}.jpg`;
      const saved = await store.put(key, img.data, "image/jpeg");
      const thumb = await store.put(key.replace(/\.jpg$/, "_thumb.webp"), img.thumbnail, "image/webp");
      items.push({
        storageKey: key,
        url: saved.url,
        thumbnailUrl: thumb.url,
        width: img.width,
        height: img.height,
        sizeBytes: img.data.length,
        phash: img.phash,
        detection: await detector.detect(img.data),
      });
    }
    pool.set(kind, items);
  }
  return pool;
}

interface Spec {
  index: number;
  latitude: number;
  longitude: number;
  createdAt: Date;
  category: CategorySlug;
  image: PooledImage;
  roadType: RoadType;
  trafficLevel: TrafficLevel;
  userIndex: number;
  status: ReportStatus;
  resolvedAt: Date | null;
  dedupStatus: "UNIQUE" | "SUSPECTED" | "DUPLICATE";
  duplicateOf: number | null;
  duplicateScore: number | null;
  dedupReasons: string[];
}

function lifecycle(
  createdAt: Date,
  slaHours: number,
  now: number,
): { status: ReportStatus; resolvedAt: Date | null } {
  const ageDays = (now - createdAt.getTime()) / DAY;
  const roll = rand();
  const resolvedChance =
    ageDays > 45 ? 0.82 : ageDays > 21 ? 0.62 : ageDays > 7 ? 0.35 : ageDays > 2 ? 0.1 : 0;
  if (roll < resolvedChance) {
    const hours = Math.min(ageDays * 24 * 0.95, slaHours * (0.3 + rand() * 2.2) + rand() * 24);
    return { status: "RESOLVED", resolvedAt: new Date(createdAt.getTime() + Math.max(2, hours) * HOUR) };
  }
  if (roll < resolvedChance + 0.05 && ageDays > 3) return { status: "REJECTED", resolvedAt: null };
  const open: Record<string, number> =
    ageDays < 1.5
      ? { NEW: 8, VERIFIED: 2 }
      : ageDays < 7
        ? { NEW: 3, VERIFIED: 3, ASSIGNED: 3, IN_PROGRESS: 1 }
        : { NEW: 1, VERIFIED: 2, ASSIGNED: 3, IN_PROGRESS: 3 };
  return { status: weighted(open) as ReportStatus, resolvedAt: null };
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "true") {
    throw new Error("Refusing to seed a production database. Set SEED_FORCE=true to override.");
  }
  if (process.env.SEED_IF_EMPTY === "true" && (await prisma.user.count()) > 0) {
    console.log("Database already contains data — skipping demo seed (SEED_IF_EMPTY=true).");
    return;
  }
  const started = Date.now();
  console.log("🌱 Seeding CivicPulse demo data…");
  await wipe();

  const municipality = await prisma.municipality.create({
    data: {
      name: "Bengaluru (Demo)",
      slug: "bengaluru",
      state: "Karnataka",
      country: "IN",
      timezone: "Asia/Kolkata",
      centerLat: 12.9716,
      centerLng: 77.6146,
      defaultZoom: 12,
    },
  });

  await prisma.issueCategory.createMany({
    data: CATEGORIES.map((c, i) => ({ ...c, color: c.slug === "other" ? NEUTRAL_SERIES : CATEGORICAL[i] })),
  });
  const categories = await prisma.issueCategory.findMany();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  await prisma.neighborhood.createMany({
    data: NEIGHBORHOODS.map((n) => ({
      municipalityId: municipality.id,
      name: n.name,
      centerLat: n.lat,
      centerLng: n.lng,
      radiusM: 3500,
    })),
  });
  const neighborhoods = await prisma.neighborhood.findMany({ where: { municipalityId: municipality.id } });

  const teams = await Promise.all(
    TEAMS.map((t) => prisma.team.create({ data: { ...t, municipalityId: municipality.id } })),
  );

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const admin = await prisma.user.create({
    data: {
      email: "admin@civicpulse.dev",
      name: "Meera Krishnan",
      role: "ADMIN",
      passwordHash,
      municipalityId: municipality.id,
    },
  });
  const staffSpecs = [
    { email: "staff@civicpulse.dev", name: "Suresh Babu", team: 0 },
    { email: "west.roads@civicpulse.dev", name: "Lakshmi Prasad", team: 1 },
    { email: "drains@civicpulse.dev", name: "Imran Pasha", team: 2 },
    { email: "waste@civicpulse.dev", name: "Geetha Ramesh", team: 3 },
    { email: "lighting@civicpulse.dev", name: "Naveen Kumar", team: 4 },
  ];
  const staff = [];
  for (const s of staffSpecs) {
    staff.push(
      await prisma.user.create({
        data: {
          email: s.email,
          name: s.name,
          role: "STAFF",
          passwordHash,
          municipalityId: municipality.id,
          teamId: teams[s.team].id,
        },
      }),
    );
  }
  const citizens = [];
  for (const [name, email] of CITIZENS) {
    citizens.push(
      await prisma.user.create({
        data: { email, name, role: "CITIZEN", passwordHash, municipalityId: municipality.id },
      }),
    );
  }

  console.log("  • rendering and analysing demo photos…");
  const pool = await buildImagePool();

  /* ── Generate report specs ── */
  const now = Date.now();
  const total = 280;
  const hotspotTotal = HOTSPOTS.reduce((s, h) => s + h.weight, 0);
  const specs: Spec[] = [];
  for (let i = 0; i < total; i++) {
    // Slight upward trend in reporting volume over the 120-day window.
    const ageDays = 120 * (1 - Math.sqrt(rand()));
    const createdAt = new Date(now - ageDays * DAY - rand() * 6 * HOUR);
    let category: CategorySlug;
    let point: { latitude: number; longitude: number };
    if (rand() < 0.55) {
      let r = rand() * hotspotTotal;
      const h = HOTSPOTS.find((x) => (r -= x.weight) <= 0) ?? HOTSPOTS[0];
      const hood = NEIGHBORHOODS.find((n) => n.name === h.hood)!;
      point = jitter(hood.lat + h.offset[0], hood.lng + h.offset[1], 110);
      category =
        rand() < 0.75 ? h.category : weighted({ pothole: 4, "road-crack": 2, trash: 1, "blocked-drain": 1 });
    } else {
      const hood = pick(NEIGHBORHOODS);
      point = jitter(hood.lat, hood.lng, 1200);
      category = weighted({
        pothole: 30,
        "road-crack": 11,
        "blocked-drain": 11,
        "water-leak": 7,
        trash: 15,
        "fallen-sign": 6,
        "broken-streetlight": 9,
        "open-manhole": 4,
        other: 4,
      });
    }
    const cat = categoryBySlug.get(category)!;
    const life = lifecycle(createdAt, cat.slaHours, now);
    specs.push({
      index: i,
      ...point,
      createdAt,
      category,
      image: pick(pool.get(SCENE_FOR[category])!),
      roadType: weighted({ ARTERIAL: 4, COLLECTOR: 4, LOCAL: 3, HIGHWAY: 1, UNKNOWN: 1 }),
      trafficLevel: weighted({ HEAVY: 3, MODERATE: 4, LOW: 2, UNKNOWN: 1 }),
      userIndex: Math.floor(rand() * citizens.length),
      ...life,
      dedupStatus: "UNIQUE",
      duplicateOf: null,
      duplicateScore: null,
      dedupReasons: [],
    });
  }

  // Explicit corroborating reports: other citizens reporting the same issue shortly after.
  const originals = specs.filter((s) => s.status !== "REJECTED").slice(0, 40);
  for (const o of originals) {
    if (rand() > 0.55) continue;
    const createdAt = new Date(Math.min(now - HOUR, o.createdAt.getTime() + (2 + rand() * 60) * HOUR));
    specs.push({
      ...o,
      index: specs.length,
      ...jitter(o.latitude, o.longitude, 8),
      createdAt,
      image: rand() < 0.7 ? o.image : pick(pool.get(SCENE_FOR[o.category])!),
      userIndex: (o.userIndex + 1 + Math.floor(rand() * 5)) % citizens.length,
      status: "NEW",
      resolvedAt: null,
    });
  }

  /* ── Chronological deduplication with the production scoring function ── */
  specs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  specs.forEach((s, i) => (s.index = i));
  const radiusM = Number(process.env.DEDUP_RADIUS_M ?? 60);
  const windowDays = Number(process.env.DEDUP_WINDOW_DAYS ?? 30);
  for (const s of specs) {
    const cat = categoryBySlug.get(s.category)!;
    const candidates: DedupCandidate[] = specs
      .filter(
        (o) =>
          o.index < s.index &&
          o.status !== "REJECTED" &&
          (o.resolvedAt == null || o.resolvedAt >= s.createdAt),
      )
      .map((o) => ({
        id: String(o.index),
        latitude: o.latitude,
        longitude: o.longitude,
        createdAt: o.createdAt,
        categorySlug: o.category,
        categoryGroup: categoryBySlug.get(o.category)!.group,
        phashes: [o.image.phash],
      }));
    const match = findBestDuplicate(
      {
        latitude: s.latitude,
        longitude: s.longitude,
        createdAt: s.createdAt,
        categorySlug: s.category,
        categoryGroup: cat.group,
        phashes: [s.image.phash],
      },
      candidates,
      { radiusM, windowDays },
    );
    if (!match) continue;
    const status = classifyDuplicate(match.score);
    if (status === "UNIQUE") continue;
    const target = specs[Number(match.candidateId)];
    const primary =
      target.dedupStatus === "DUPLICATE" && target.duplicateOf != null ? specs[target.duplicateOf] : target;
    s.dedupStatus = status;
    s.duplicateOf = primary.index;
    s.duplicateScore = match.score;
    s.dedupReasons = match.reasons;
    if (status === "DUPLICATE") {
      s.status = "DUPLICATE";
      s.resolvedAt = primary.resolvedAt && primary.resolvedAt > s.createdAt ? primary.resolvedAt : null;
    } else if (s.status === "RESOLVED" || s.status === "REJECTED") {
      // Suspected duplicates stay in the triage queue until staff decide.
      s.status = "NEW";
      s.resolvedAt = null;
    }
  }

  /* ── Persist ── */
  console.log(`  • writing ${specs.length} reports…`);
  const ids: string[] = [];
  const groupIds = new Map<number, string>();
  const usedRefs = new Set<string>();
  for (const s of specs) {
    const cat = categoryBySlug.get(s.category)!;
    const det = s.image.detection;
    const aiCategory = det.label !== "other" ? categoryBySlug.get(det.label) : undefined;
    const aiAgrees = aiCategory ? aiCategory.group === cat.group : false;
    const severity = computeSeverity({
      categoryBase: cat.baseSeverity,
      aiConfidence: det.confidence,
      damageAreaRatio: det.damageAreaRatio,
      aiAgrees,
    });
    const neighborhood = nearestNeighborhood(s, neighborhoods);
    const author = citizens[s.userIndex];
    const [title, description] = pick(TEXT[s.category]);
    // Road crews are split east/west of the city centre; other categories go to their specialist team.
    const team =
      cat.group === "road"
        ? teams[s.longitude > 77.6 ? 0 : 1]
        : (teams.find((t) => t.specialties.includes(s.category)) ?? teams[4]);
    const teamMember = staff.find((m) => m.teamId === team.id)!;
    let refCode = generateRefCode();
    while (usedRefs.has(refCode)) refCode = generateRefCode();
    usedRefs.add(refCode);

    const primaryId = s.duplicateOf != null ? ids[s.duplicateOf] : null;
    let groupId: string | null = null;
    if (s.dedupStatus === "DUPLICATE" && primaryId) {
      groupId = groupIds.get(s.duplicateOf!) ?? null;
      if (!groupId) {
        const group = await prisma.duplicateGroup.create({
          data: { primaryReportId: primaryId, reason: `Auto-detected: ${s.dedupReasons.join(", ")}` },
        });
        groupId = group.id;
        groupIds.set(s.duplicateOf!, groupId);
      }
    }

    const assigned = ["ASSIGNED", "IN_PROGRESS", "RESOLVED"].includes(s.status);
    const report = await prisma.report.create({
      data: {
        refCode,
        userId: author.id,
        municipalityId: municipality.id,
        neighborhoodId: neighborhood?.id ?? null,
        title,
        description,
        categoryId: cat.id,
        aiSuggestedCategoryId: aiCategory?.id ?? null,
        aiAccepted: aiCategory ? aiCategory.id === cat.id : null,
        status: s.status,
        severity: severity.level,
        severityScore: severity.score,
        priorityScore: 0,
        priorityBreakdown: [],
        confidence: aiAgrees ? det.confidence : null,
        latitude: s.latitude,
        longitude: s.longitude,
        accuracyM: Math.round(4 + rand() * 20),
        address: neighborhood
          ? `${pick(["Main Rd", "1st Cross", "80 Feet Rd", "Service Rd", "4th Block", "Outer Ring Rd"])}, ${neighborhood.name}, Bengaluru`
          : null,
        roadType: s.roadType,
        trafficLevel: s.trafficLevel,
        dedupStatus: s.dedupStatus,
        duplicateOfId: primaryId,
        duplicateScore: s.duplicateScore,
        duplicateGroupId: groupId,
        assignedToId: assigned ? teamMember.id : null,
        resolvedAt: s.resolvedAt,
        createdAt: s.createdAt,
        updatedAt: s.resolvedAt ?? s.createdAt,
        media: {
          create: {
            type: "IMAGE",
            url: s.image.url,
            storageKey: s.image.storageKey,
            thumbnailUrl: s.image.thumbnailUrl,
            mimeType: "image/jpeg",
            sizeBytes: s.image.sizeBytes,
            width: s.image.width,
            height: s.image.height,
            storageProvider: storage().name,
            phash: s.image.phash,
            createdAt: s.createdAt,
          },
        },
      },
      include: { media: true },
    });
    ids.push(report.id);

    const aiSeverity = computeSeverity({
      categoryBase: aiCategory?.baseSeverity ?? 30,
      aiConfidence: det.confidence,
      damageAreaRatio: det.damageAreaRatio,
      aiAgrees: true,
    });
    await prisma.detectionResult.create({
      data: {
        reportId: report.id,
        mediaAssetId: report.media[0].id,
        modelName: det.modelName,
        modelVersion: det.modelVersion,
        label: det.label,
        confidence: det.confidence,
        boundingBox: (det.boundingBox ?? undefined) as Prisma.InputJsonValue | undefined,
        severityScore: aiSeverity.score,
        damageAreaRatio: det.damageAreaRatio,
        latencyMs: det.latencyMs,
        raw: {
          source: det.source,
          detections: det.detections,
          ...(det.raw ?? {}),
        } as unknown as Prisma.InputJsonValue,
        createdAt: s.createdAt,
      },
    });

    /* Activity timeline consistent with the lifecycle. */
    const t = (h: number) =>
      new Date(Math.min(s.createdAt.getTime() + h * HOUR, s.resolvedAt?.getTime() ?? now, now));
    const logs: Prisma.StatusLogCreateManyInput[] = [
      {
        reportId: report.id,
        type: "CREATED",
        status: "NEW",
        note: "Report submitted",
        actorId: author.id,
        createdAt: s.createdAt,
      },
      {
        reportId: report.id,
        type: "AI_ANALYSIS",
        status: "NEW",
        isPublic: false,
        note: `${det.modelName} suggested “${aiCategory?.name ?? "Other"}” (${Math.round(det.confidence * 100)}%)${aiCategory && aiCategory.id !== cat.id ? ` — citizen chose “${cat.name}”` : aiCategory ? " — confirmed by citizen" : ""}`,
        createdAt: new Date(s.createdAt.getTime() + 2000),
      },
    ];
    if (s.dedupStatus !== "UNIQUE" && s.duplicateOf != null) {
      const primary = specs[s.duplicateOf];
      logs.push({
        reportId: report.id,
        type: "DUPLICATE",
        status: s.dedupStatus === "DUPLICATE" ? "DUPLICATE" : "NEW",
        previousStatus: "NEW",
        isPublic: s.dedupStatus === "DUPLICATE",
        note:
          s.dedupStatus === "DUPLICATE"
            ? `Merged into ${(await prisma.report.findUnique({ where: { id: ids[primary.index] }, select: { refCode: true } }))!.refCode} — ${s.dedupReasons.join(", ")}`
            : `Flagged as a possible duplicate (${Math.round((s.duplicateScore ?? 0) * 100)}% match: ${s.dedupReasons.join(", ")})`,
        createdAt: new Date(s.createdAt.getTime() + 3000),
      });
    }
    const steps: Array<[ReportStatus, number, string]> = [];
    if (["VERIFIED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"].includes(s.status))
      steps.push(["VERIFIED", 2 + rand() * 10, "Confirmed by city staff"]);
    if (s.status === "REJECTED")
      steps.push(["REJECTED", 6 + rand() * 30, "Not actionable — located on private property"]);
    for (const [status, h, note] of steps) {
      logs.push({
        reportId: report.id,
        type: "STATUS_CHANGE",
        status,
        previousStatus: "NEW",
        note,
        actorId: admin.id,
        createdAt: t(h),
      });
    }
    if (assigned) {
      const assignedAt = t(10 + rand() * 20);
      await prisma.teamAssignment.create({
        data: {
          reportId: report.id,
          teamId: team.id,
          assigneeId: teamMember.id,
          assignedById: admin.id,
          dueAt: new Date(s.createdAt.getTime() + cat.slaHours * HOUR),
          active: s.status !== "RESOLVED",
          completedAt: s.resolvedAt,
          createdAt: assignedAt,
        },
      });
      logs.push({
        reportId: report.id,
        type: "ASSIGNMENT",
        status: "ASSIGNED",
        previousStatus: "VERIFIED",
        note: `Assigned to ${team.name}`,
        actorId: admin.id,
        createdAt: assignedAt,
      });
      if (s.status === "IN_PROGRESS" || s.status === "RESOLVED") {
        logs.push({
          reportId: report.id,
          type: "STATUS_CHANGE",
          status: "IN_PROGRESS",
          previousStatus: "ASSIGNED",
          note: "Crew is working on it",
          actorId: teamMember.id,
          createdAt: t(20 + rand() * 30),
        });
      }
      if (rand() < 0.35) {
        logs.push({
          reportId: report.id,
          type: "NOTE",
          status: s.status,
          isPublic: false,
          note: pick([
            "Crew inspected site; material requisitioned.",
            "Needs traffic police support for lane closure.",
            "Coordinate with BWSSB before digging.",
            "Cold-mix patch applied as temporary fix.",
          ]),
          actorId: teamMember.id,
          createdAt: t(24 + rand() * 24),
        });
      }
    }
    if (s.status === "RESOLVED" && s.resolvedAt) {
      logs.push({
        reportId: report.id,
        type: "STATUS_CHANGE",
        status: "RESOLVED",
        previousStatus: "IN_PROGRESS",
        note: pick([
          "Pothole patched with hot-mix asphalt.",
          "Repaired and area cleared.",
          "Fixed — please report again if it recurs.",
          "Work completed by field crew.",
        ]),
        actorId: teamMember.id,
        createdAt: s.resolvedAt,
      });
    }
    await prisma.statusLog.createMany({ data: logs });
  }

  // Corroboration counts on primaries.
  const counts = new Map<number, number>();
  for (const s of specs)
    if (s.dedupStatus === "DUPLICATE" && s.duplicateOf != null)
      counts.set(s.duplicateOf, (counts.get(s.duplicateOf) ?? 0) + 1);
  for (const [index, count] of counts)
    await prisma.report.update({ where: { id: ids[index] }, data: { duplicateCount: count } });

  console.log("  • computing hotspots and priorities…");
  await recomputeHotspots(municipality.id);
  await recomputeOpenPriorities(municipality.id);
  const closed = await prisma.report.findMany({
    where: { municipalityId: municipality.id, status: { in: ["RESOLVED", "REJECTED", "DUPLICATE"] } },
    select: { id: true },
  });
  for (const r of closed) await recomputeReportPriority(r.id);

  console.log("  • writing analytics snapshots…");
  const days = Array.from({ length: 90 }, (_, i) => new Date(now - (89 - i) * DAY));
  await snapshotDays(municipality.id, days);

  // Urgent alerts for the most pressing open issues, plus citizen updates.
  const urgent = await prisma.report.findMany({
    where: {
      municipalityId: municipality.id,
      status: { in: ["NEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS"] },
      priorityScore: { gte: 70 },
    },
    orderBy: { priorityScore: "desc" },
    take: 6,
    include: { category: true },
  });
  for (const r of urgent) {
    await prisma.notification.create({
      data: {
        municipalityId: municipality.id,
        reportId: r.id,
        channel: "IN_APP",
        status: "SENT",
        sentAt: r.createdAt,
        severity: r.severity,
        title: `Urgent: ${r.category.name} (${r.refCode})`,
        body: `${r.title} — priority ${Math.round(r.priorityScore)}/100${r.address ? ` at ${r.address}` : ""}.`,
        createdAt: r.createdAt,
      },
    });
  }
  const demoCitizen = citizens[0];
  const resolvedForDemo = await prisma.report.findMany({
    where: { userId: demoCitizen.id, status: "RESOLVED" },
    take: 2,
  });
  for (const r of resolvedForDemo) {
    await prisma.notification.create({
      data: {
        userId: demoCitizen.id,
        reportId: r.id,
        channel: "IN_APP",
        status: "SENT",
        sentAt: r.resolvedAt,
        title: `Update on ${r.refCode}`,
        body: `“${r.title}” has been resolved. Thank you for reporting!`,
        createdAt: r.resolvedAt ?? new Date(),
      },
    });
  }

  const summary = await prisma.report.groupBy({ by: ["status"], _count: { _all: true } });
  const hotspots = await prisma.hotspotCluster.count();
  console.log(
    `✅ Seeded ${specs.length} reports, ${hotspots} hotspots in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log("   " + summary.map((s) => `${s.status}: ${s._count._all}`).join(" · "));
  console.log(`\n   Demo accounts (password: ${DEMO_PASSWORD})`);
  console.log("   admin@civicpulse.dev    – city administrator");
  console.log("   staff@civicpulse.dev    – road maintenance staff");
  console.log("   citizen@civicpulse.dev  – citizen reporter\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
