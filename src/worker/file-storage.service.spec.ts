import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageService, StorageArea } from './file-storage.service';

describe('FileStorageService', () => {
  let service: FileStorageService;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'chainverse-uploads-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'uploads.root' ? root : undefined),
          },
        },
      ],
    }).compile();

    service = module.get(FileStorageService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('storeInQuarantine', () => {
    it('writes new uploads into the quarantine area, not the clean one', async () => {
      const stored = await service.storeInQuarantine(
        Buffer.from('%PDF-1.7\n'),
        '.pdf',
      );

      expect(stored.area).toBe(StorageArea.QUARANTINE);
      expect(stored.absolutePath).toContain(`${StorageArea.QUARANTINE}/`);
      expect(stored.absolutePath).not.toContain(`${StorageArea.CLEAN}/`);
      await expect(readFile(stored.absolutePath, 'utf8')).resolves.toBe(
        '%PDF-1.7\n',
      );
    });

    it('generates a random storage key rather than reusing any caller input', async () => {
      const a = await service.storeInQuarantine(Buffer.from('a'), '.pdf');
      const b = await service.storeInQuarantine(Buffer.from('b'), '.pdf');

      expect(a.storageKey).not.toBe(b.storageKey);
      expect(a.storageKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
      );
    });

    it('records the sha256 and size of the stored bytes', async () => {
      const stored = await service.storeInQuarantine(
        Buffer.from('abc'),
        '.pdf',
      );

      expect(stored.size).toBe(3);
      // sha256("abc")
      expect(stored.sha256).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('falls back to .bin for a suspicious extension', async () => {
      const stored = await service.storeInQuarantine(
        Buffer.from('x'),
        '.php.pdf/../..',
      );

      expect(stored.storageKey.endsWith('.bin')).toBe(true);
    });

    it('writes files owner-readable only', async () => {
      const stored = await service.storeInQuarantine(Buffer.from('x'), '.pdf');
      const stats = await stat(stored.absolutePath);

      expect(stats.mode & 0o777).toBe(0o600);
    });
  });

  describe('move', () => {
    it('promotes a scanned file from quarantine to clean', async () => {
      const stored = await service.storeInQuarantine(Buffer.from('ok'), '.pdf');

      const target = await service.move(
        stored.storageKey,
        StorageArea.QUARANTINE,
        StorageArea.CLEAN,
      );

      expect(target).toContain(`${StorageArea.CLEAN}/`);
      await expect(
        service.exists(stored.storageKey, StorageArea.CLEAN),
      ).resolves.toBe(true);
      await expect(
        service.exists(stored.storageKey, StorageArea.QUARANTINE),
      ).resolves.toBe(false);
    });

    it('quarantines a detection under the infected area', async () => {
      const stored = await service.storeInQuarantine(
        Buffer.from('bad'),
        '.pdf',
      );

      await service.move(
        stored.storageKey,
        StorageArea.QUARANTINE,
        StorageArea.INFECTED,
      );

      await expect(
        service.exists(stored.storageKey, StorageArea.INFECTED),
      ).resolves.toBe(true);
    });
  });

  describe('remove', () => {
    it('deletes the stored bytes', async () => {
      const stored = await service.storeInQuarantine(Buffer.from('x'), '.pdf');

      await service.remove(stored.storageKey, StorageArea.QUARANTINE);

      await expect(
        service.exists(stored.storageKey, StorageArea.QUARANTINE),
      ).resolves.toBe(false);
    });

    it('is a no-op for a file that is already gone', async () => {
      await expect(
        service.remove('never-existed.pdf', StorageArea.QUARANTINE),
      ).resolves.toBeUndefined();
    });
  });

  describe('resolveWithin', () => {
    it('resolves an ordinary key inside its area', () => {
      expect(service.resolveWithin(StorageArea.CLEAN, 'file.pdf')).toBe(
        join(root, StorageArea.CLEAN, 'file.pdf'),
      );
    });

    it.each(['../quarantine/secret.pdf', '../../../etc/passwd', '/etc/passwd'])(
      'refuses a key escaping the area: %s',
      (key) => {
        expect(() => service.resolveWithin(StorageArea.CLEAN, key)).toThrow(
          /outside/,
        );
      },
    );
  });

  describe('root', () => {
    it('defaults outside the served tree', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FileStorageService,
          { provide: ConfigService, useValue: { get: () => undefined } },
        ],
      }).compile();

      const defaulted = module.get(FileStorageService);

      expect(defaulted.root).toContain('var/uploads');
    });
  });
});
