import { describe, expect, it } from "vitest";
import { findRepeatZones, summarizeDay } from "@/lib/analytics";
import { csvEscape, toCsv } from "@/lib/csv";
import { bestHashSimilarity, dHashFromPixels, hammingDistance, hashSimilarity } from "@/lib/phash";
import { isRateLimited, rateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/utils";
import {
  createReportSchema,
  registerSchema,
  reportFiltersSchema,
  searchParamsToRecord,
} from "@/lib/validation";

describe("phash", () => {
  it("computes hamming distance between hex hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistance("000000000000000f", "0000000000000000")).toBe(4);
  });

  it("maps distance to similarity", () => {
    expect(hashSimilarity("ffff0000ffff0000", "ffff0000ffff0001")).toBe(1);
    expect(hashSimilarity("0000000000000000", "ffffffffffffffff")).toBe(0);
    expect(bestHashSimilarity([], ["ffff0000ffff0000"])).toBeNull();
  });

  it("builds a dHash from a gradient", () => {
    const pixels = new Uint8Array(72).map((_, i) => 255 - (i % 9) * 20); // decreasing left→right
    expect(dHashFromPixels(pixels)).toBe("ffffffffffffffff");
  });
});

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvEscape('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe("");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvEscape("=HYPERLINK(evil)")).toBe("'=HYPERLINK(evil)");
    expect(csvEscape("-2+3")).toBe("'-2+3");
  });

  it("serialises rows with headers", () => {
    const out = toCsv(
      [{ a: 1, b: "x" }],
      [
        { key: "a", header: "A" },
        { key: "b", header: "B" },
      ],
    );
    expect(out).toBe("A,B\r\n1,x\r\n");
  });
});

describe("sanitizeText", () => {
  it("strips control characters and collapses whitespace", () => {
    expect(sanitizeText("  hello\u0000   world \t ")).toBe("hello world");
    expect(sanitizeText("a\n\n\n\nb", { multiline: true })).toBe("a\n\nb");
  });
});

describe("rateLimit", () => {
  it("allows up to the limit within a window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("t", "k", 3, 1000, now).ok).toBe(true);
    const blocked = rateLimit("t", "k", 3, 1000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(rateLimit("t", "k", 3, 1000, now + 1001).ok).toBe(true);
  });

  it("peeks without consuming", () => {
    const now = 5_000_000;
    expect(isRateLimited("peek", "k", 2, now)).toBe(false);
    rateLimit("peek", "k", 2, 1000, now);
    rateLimit("peek", "k", 2, 1000, now);
    expect(isRateLimited("peek", "k", 2, now)).toBe(true);
    expect(isRateLimited("peek", "k", 2, now + 1001)).toBe(false);
  });
});

describe("validation", () => {
  const valid = {
    categorySlug: "pothole",
    title: "Deep pothole near bus stop",
    description: "Large pothole in the left lane, about 1 m wide.",
    latitude: "12.93",
    longitude: "77.62",
  };

  it("accepts and normalises a valid report", () => {
    const parsed = createReportSchema.parse({ ...valid, title: "  Deep   pothole near bus stop " });
    expect(parsed.title).toBe("Deep pothole near bus stop");
    expect(parsed.latitude).toBe(12.93);
    expect(parsed.roadType).toBe("UNKNOWN");
  });

  it("rejects invalid coordinates and short descriptions", () => {
    expect(createReportSchema.safeParse({ ...valid, latitude: "0", longitude: "0" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...valid, description: "short" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...valid, categorySlug: "<script>" }).success).toBe(false);
  });

  it("enforces password strength on registration", () => {
    expect(registerSchema.safeParse({ name: "Asha", email: "a@b.co", password: "password" }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({ name: "Asha", email: "A@B.co", password: "passw0rd!" }).data?.email,
    ).toBe("a@b.co");
  });

  it("parses list filters from query strings", () => {
    const params = new URLSearchParams(
      "status=NEW,VERIFIED&severity=CRITICAL&severity=HIGH&page=2&sort=newest&from=2026-01-01",
    );
    const f = reportFiltersSchema.parse(searchParamsToRecord(params));
    expect(f.status).toEqual(["NEW", "VERIFIED"]);
    expect(f.severity).toEqual(["CRITICAL", "HIGH"]);
    expect(f.page).toBe(2);
    expect(f.sort).toBe("newest");
    expect(f.from).toBeInstanceOf(Date);
    expect(reportFiltersSchema.safeParse({ status: "BOGUS" }).success).toBe(false);
  });
});

describe("analytics", () => {
  const day = new Date("2026-06-10T00:00:00Z");
  const r = (over: Partial<Parameters<typeof summarizeDay>[0][number]>) => ({
    createdAt: new Date("2026-06-10T08:00:00Z"),
    resolvedAt: null,
    status: "NEW",
    dedupStatus: "UNIQUE",
    severity: "HIGH",
    severityScore: 70,
    categorySlug: "pothole",
    ...over,
  });

  it("summarises a day point-in-time", () => {
    const s = summarizeDay(
      [
        r({}),
        r({
          createdAt: new Date("2026-06-01T00:00:00Z"),
          resolvedAt: new Date("2026-06-10T12:00:00Z"),
          status: "RESOLVED",
        }),
        r({ dedupStatus: "DUPLICATE", status: "DUPLICATE" }),
        r({ createdAt: new Date("2026-06-11T01:00:00Z") }),
        r({ severity: "CRITICAL" }),
      ],
      day,
    );
    expect(s.totalReports).toBe(4);
    expect(s.newReports).toBe(3);
    expect(s.resolvedReports).toBe(1);
    expect(s.duplicateReports).toBe(1);
    expect(s.openReports).toBe(2);
    expect(s.criticalOpen).toBe(1);
    expect(s.avgResolutionHours).toBe(228);
  });

  it("detects repeat problem zones", () => {
    const zones = findRepeatZones([
      {
        id: "a",
        latitude: 12.93,
        longitude: 77.62,
        createdAt: new Date("2026-01-01"),
        resolvedAt: new Date("2026-01-10"),
        categoryGroup: "road",
        neighborhood: "X",
      },
      {
        id: "b",
        latitude: 12.9301,
        longitude: 77.62,
        createdAt: new Date("2026-03-01"),
        resolvedAt: null,
        categoryGroup: "road",
        neighborhood: "X",
      },
      {
        id: "c",
        latitude: 12.9301,
        longitude: 77.62,
        createdAt: new Date("2026-03-02"),
        resolvedAt: null,
        categoryGroup: "water",
        neighborhood: "X",
      },
    ]);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ reportId: "a", recurrences: 1 });
  });
});
