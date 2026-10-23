import "server-only";
import { prisma } from "../db";
import { env } from "../env";
import { DatabaseStorageProvider } from "./database";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let provider: StorageProvider | undefined;

/**
 * Returns the configured storage backend. Additional providers (e.g. Cloudinary) only need to
 * implement StorageProvider and be added to this switch.
 */
export function storage(): StorageProvider {
  if (!provider) {
    const config = env();
    switch (config.STORAGE_PROVIDER) {
      case "database":
        provider = new DatabaseStorageProvider(prisma);
        break;
      case "s3":
        if (!config.S3_BUCKET) throw new Error("STORAGE_PROVIDER=s3 requires S3_BUCKET");
        provider = new S3StorageProvider({
          bucket: config.S3_BUCKET,
          region: config.S3_REGION,
          endpoint: config.S3_ENDPOINT,
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
          prefix: config.S3_PREFIX,
        });
        break;
      case "local":
      default:
        provider = new LocalStorageProvider(config.UPLOAD_DIR);
    }
  }
  return provider;
}

export type { StorageProvider, StoredObject } from "./types";
