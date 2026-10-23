import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertSafeKey, type StorageProvider, type StoredObject } from "./types";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
}

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, Supabase Storage S3 endpoint).
 * Objects stay private: the app streams them through the authenticated /api/media route.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ? `${config.prefix.replace(/\/+$/, "")}/` : "";
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  private objectKey(key: string) {
    assertSafeKey(key);
    return `${this.prefix}${key}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: data,
        ContentType: contentType,
        CacheControl: "private, max-age=31536000, immutable",
      }),
    );
    return { key, url: `/api/media/${key}`, provider: this.name };
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      if (!res.Body) return null;
      const data = Buffer.from(await res.Body.transformToByteArray());
      return { data, size: data.length };
    } catch (err) {
      if (err instanceof NoSuchKey || (err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }
}
