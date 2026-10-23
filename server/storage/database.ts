import type { PrismaClient } from "@prisma/client";
import { assertSafeKey, type StorageProvider, type StoredObject } from "./types";

/**
 * Stores media bytes in PostgreSQL (StoredFile table). Intended for free hosting tiers that have
 * neither a persistent disk nor object storage; prefer "s3" or "local" + volume at scale.
 */
export class DatabaseStorageProvider implements StorageProvider {
  readonly name = "database";

  constructor(private readonly db: PrismaClient) {}

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    assertSafeKey(key);
    const bytes = new Uint8Array(data);
    await this.db.storedFile.upsert({
      where: { key },
      create: { key, data: bytes, contentType, size: data.length },
      update: { data: bytes, contentType, size: data.length },
    });
    return { key, url: `/api/media/${key}`, provider: this.name };
  }

  async get(key: string) {
    assertSafeKey(key);
    const row = await this.db.storedFile.findUnique({ where: { key }, select: { data: true, size: true } });
    return row ? { data: Buffer.from(row.data), size: row.size } : null;
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.db.storedFile.deleteMany({ where: { key } });
  }
}
