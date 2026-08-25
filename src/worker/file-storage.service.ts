import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, ReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import * as crypto from 'node:crypto';

/** Sub-directories of the upload root, none of which is web-served. */
export enum StorageArea {
  QUARANTINE = 'quarantine',
  CLEAN = 'clean',
  INFECTED = 'infected',
}

export interface StoredFile {
  /** Opaque storage key; never derived from caller input. */
  storageKey: string;
  area: StorageArea;
  absolutePath: string;
  size: number;
  sha256: string;
}

/**
 * Owns every byte written by the upload pipeline.
 *
 * Two properties matter here:
 *  - Storage names are generated (`randomUUID`), so a caller can never
 *    influence a path, and collisions or overwrites are not possible.
 *  - The root defaults to `var/uploads`, deliberately outside any directory the
 *    application serves, and files land in `quarantine/` first. Nothing reaches
 *    `clean/` until a scan says so.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Absolute path of the upload root. */
  get root(): string {
    const configured =
      this.configService.get<string>('uploads.root') ?? 'var/uploads';
    return isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured);
  }

  areaPath(area: StorageArea): string {
    return join(this.root, area);
  }

  /**
   * Writes a validated buffer into quarantine under a freshly generated key.
   * Mode 0600 keeps the bytes unreadable to other local users.
   */
  async storeInQuarantine(
    buffer: Buffer,
    extension: string,
  ): Promise<StoredFile> {
    const safeExtension = /^\.[A-Za-z0-9]{1,10}$/.test(extension)
      ? extension.toLowerCase()
      : '.bin';
    const storageKey = `${crypto.randomUUID()}${safeExtension}`;

    const directory = this.areaPath(StorageArea.QUARANTINE);
    await mkdir(directory, { recursive: true, mode: 0o700 });

    const absolutePath = this.resolveWithin(StorageArea.QUARANTINE, storageKey);
    await writeFile(absolutePath, buffer, { mode: 0o600, flag: 'wx' });

    return {
      storageKey,
      area: StorageArea.QUARANTINE,
      absolutePath,
      size: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  }

  /** Moves a stored file between areas (quarantine → clean / infected). */
  async move(
    storageKey: string,
    from: StorageArea,
    to: StorageArea,
  ): Promise<string> {
    const source = this.resolveWithin(from, storageKey);
    const targetDirectory = this.areaPath(to);
    await mkdir(targetDirectory, { recursive: true, mode: 0o700 });

    const target = this.resolveWithin(to, storageKey);
    await rename(source, target);
    return target;
  }

  async remove(storageKey: string, area: StorageArea): Promise<void> {
    try {
      await rm(this.resolveWithin(area, storageKey), { force: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to remove ${area}/${storageKey} from upload storage: ${message}`,
      );
    }
  }

  async exists(storageKey: string, area: StorageArea): Promise<boolean> {
    try {
      await stat(this.resolveWithin(area, storageKey));
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(storageKey: string, area: StorageArea): ReadStream {
    return createReadStream(this.resolveWithin(area, storageKey));
  }

  /**
   * Resolves `storageKey` inside `area` and refuses anything that escapes it.
   *
   * Keys are generated internally, so this should never trip — it is a
   * backstop against a future caller passing through a user-supplied key.
   */
  resolveWithin(area: StorageArea, storageKey: string): string {
    const areaRoot = this.areaPath(area);
    const candidate = resolve(areaRoot, storageKey);

    if (candidate !== areaRoot && !candidate.startsWith(areaRoot + sep)) {
      throw new Error(`Refusing to access path outside ${area}: ${storageKey}`);
    }
    return candidate;
  }
}
