// File storage behind a small interface so S3 / MinIO / Azure Blob can replace the local disk
// later without touching the services that store files.
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../../config/env.js';

export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

class LocalDiskStorage implements FileStorage {
  private readonly root = path.resolve(env.storage.dir);

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    // never allow keys to escape the storage folder (path traversal)
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async save(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async read(key: string) {
    const full = this.resolve(key);
    await stat(full); // throws if missing
    return createReadStream(full);
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

export const storage: FileStorage = new LocalDiskStorage();

/** org-12/2026/10/<uuid>.png — tenant-prefixed so a bucket can be split/exported per organization. */
export function buildStorageKey(organizationId: number, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  const now = new Date();
  return `org-${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;
}
