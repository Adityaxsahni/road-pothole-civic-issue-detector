import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { DatabaseStorageProvider } from "@/server/storage/database";

/** Minimal in-memory stand-in for the StoredFile delegate. */
function fakeDb() {
  const rows = new Map<string, { key: string; data: Uint8Array; contentType: string; size: number }>();
  const storedFile = {
    upsert: async ({ where, create, update }: { where: { key: string }; create: never; update: object }) => {
      const row = rows.has(where.key) ? { ...rows.get(where.key)!, ...update } : create;
      rows.set(where.key, row);
      return row;
    },
    findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null,
    deleteMany: async ({ where }: { where: { key: string } }) => ({ count: Number(rows.delete(where.key)) }),
  };
  return { db: { storedFile } as unknown as PrismaClient, rows };
}

describe("DatabaseStorageProvider", () => {
  it("round-trips bytes and serves them through the media route", async () => {
    const { db } = fakeDb();
    const store = new DatabaseStorageProvider(db);
    const saved = await store.put("reports/2026/10/a.jpg", Buffer.from("hello"), "image/jpeg");
    expect(saved).toEqual({
      key: "reports/2026/10/a.jpg",
      url: "/api/media/reports/2026/10/a.jpg",
      provider: "database",
    });
    const got = await store.get("reports/2026/10/a.jpg");
    expect(got?.data.toString()).toBe("hello");
    expect(got?.size).toBe(5);
  });

  it("overwrites, deletes and returns null for missing keys", async () => {
    const { db } = fakeDb();
    const store = new DatabaseStorageProvider(db);
    await store.put("k.jpg", Buffer.from("one"), "image/jpeg");
    await store.put("k.jpg", Buffer.from("three"), "image/jpeg");
    expect((await store.get("k.jpg"))?.data.toString()).toBe("three");
    await store.delete("k.jpg");
    expect(await store.get("k.jpg")).toBeNull();
  });

  it("rejects path traversal keys", async () => {
    const store = new DatabaseStorageProvider(fakeDb().db);
    await expect(store.put("../etc/passwd", Buffer.from("x"), "text/plain")).rejects.toThrow(/Unsafe/);
  });
});
