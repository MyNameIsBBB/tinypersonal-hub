import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../db/client";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export type StorageDriver = {
  readonly name: string;
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
};

export class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  constructor(private readonly root = process.env.MEDIA_LOCAL_ROOT ?? path.resolve(".data/media")) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, path.basename(key)), bytes, { flag: "wx", mode: 0o600 });
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(path.join(this.root, path.basename(key)));
  }

  async delete(key: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    await unlink(path.join(this.root, path.basename(key)));
  }
}

export type S3CompatibleStorageConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export class S3CompatibleStorageDriver implements StorageDriver {
  readonly name = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3CompatibleStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket, Key: key, Body: bytes, ContentType: mimeType,
    }));
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    if (!response.Body) throw new Error("Storage object has no body");
    return response.Body.transformToByteArray();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async createSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: Math.min(Math.max(expiresInSeconds, 30), 900) },
    );
  }
}

export function createStorageFromEnvironment(): StorageDriver {
  if ((process.env.MEDIA_STORAGE_DRIVER ?? "local") === "local") return new LocalStorageDriver();
  const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
  for (const name of required) if (!process.env[name]) throw new Error(`${name} is required for S3 storage`);
  return new S3CompatibleStorageDriver({
    endpoint: process.env.S3_ENDPOINT!, bucket: process.env.S3_BUCKET!, region: process.env.S3_REGION!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  });
}

export async function registerMediaAsset(input: {
  fileName: string; mimeType: string; bytes: Uint8Array;
  noteId?: string; scheduleItemId?: string;
}, storage: StorageDriver = createStorageFromEnvironment()) {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new Error("Unsupported file type");
  if (!input.bytes.length || input.bytes.length > MAX_FILE_SIZE) throw new Error("File size is outside the allowed range");
  const detected = await fileTypeFromBuffer(input.bytes);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime) || detected.mime !== input.mimeType) {
    throw new Error("File content does not match its declared type");
  }

  const declaredExtension = path.extname(input.fileName).slice(0, 12).toLowerCase();
  const extension = declaredExtension || `.${detected.ext}`;
  const storagePath = `${randomUUID()}${extension}`;
  await storage.put(storagePath, input.bytes, input.mimeType);
  return prisma.mediaAsset.create({ data: {
    fileName: path.basename(input.fileName).slice(0, 255),
    mimeType: input.mimeType,
    fileSize: input.bytes.length,
    storageDriver: storage.name,
    storagePath,
    checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
    noteId: input.noteId,
    scheduleItemId: input.scheduleItemId,
  } });
}

function signingKey(): string {
  const key = process.env.MEDIA_SIGNING_KEY;
  if (!key || key.length < 32) throw new Error("MEDIA_SIGNING_KEY must contain at least 32 characters");
  return key;
}

export function createMediaAccessToken(assetId: string, expiresAt: number): string {
  const payload = `${assetId}.${expiresAt}`;
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyMediaAccessToken(assetId: string, token: string): boolean {
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", signingKey()).update(`${assetId}.${expiresAt}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function readMediaAsset(assetId: string, storage: StorageDriver = createStorageFromEnvironment()) {
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.storageDriver !== storage.name) throw new Error("Configured storage driver cannot read this asset");
  return { asset, bytes: await storage.get(asset.storagePath) };
}

export async function listMediaAssets(limit = 100) {
  return prisma.mediaAsset.findMany({
    select: {
      id: true, fileName: true, mimeType: true, fileSize: true, noteId: true,
      scheduleItemId: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

export async function updateMediaAssetLinks(id: string, links: { noteId?: string | null; scheduleItemId?: string | null }) {
  return prisma.mediaAsset.update({ where: { id }, data: links });
}

export async function deleteMediaAsset(id: string, storage: StorageDriver = createStorageFromEnvironment()): Promise<void> {
  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
  if (asset.storageDriver !== storage.name) throw new Error("Configured storage driver cannot delete this asset");
  await storage.delete(asset.storagePath);
  await prisma.mediaAsset.delete({ where: { id } });
}
