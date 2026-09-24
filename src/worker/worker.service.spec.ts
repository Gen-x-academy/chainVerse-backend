import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { WorkerService, parseTags } from './worker.service';
import { WorkerUpload } from './schemas/worker-upload.schema';
import { UploadStatus } from './upload.constants';
import { FileStorageService, StorageArea } from './file-storage.service';
import {
  EICAR_SIGNATURE,
  MalwareScannerService,
  ScanVerdict,
} from './malware-scanner.service';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction, AuditOutcome } from '../common/audit/audit-action.enum';
import { AuditContext } from '../common/audit/audit-context';

const PDF = Buffer.from('%PDF-1.7\nhello\n');
const EICAR_PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.from(EICAR_SIGNATURE, 'ascii'),
]);

const audit: AuditContext = {
  actorId: 'tutor-1',
  actorEmail: 'tutor@chainverse.io',
  actorRole: 'tutor',
  requestId: 'req-upload-1',
  ip: '10.1.1.1',
  userAgent: 'jest',
};

const config: Record<string, unknown> = {};

/** Simulated document store — captures the saved state of each upload. */
class FakeUploadDoc {
  id = `upload-${Math.random().toString(16).slice(2, 8)}`;
  saveCount = 0;
  createdAt = new Date('2026-07-01T00:00:00.000Z');
  [key: string]: any;

  constructor(payload: Record<string, unknown>) {
    Object.assign(this, payload);
  }

  save() {
    this.saveCount += 1;
    return Promise.resolve(this);
  }
}

let created: FakeUploadDoc[] = [];
const mockUploadModel: any = jest
  .fn()
  .mockImplementation((payload: Record<string, unknown>) => {
    const doc = new FakeUploadDoc(payload);
    created.push(doc);
    return doc;
  });

const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const storage = {
  storeInQuarantine: jest.fn(),
  move: jest.fn().mockResolvedValue('/var/uploads/clean/x'),
  remove: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(true),
  createReadStream: jest.fn().mockReturnValue({ pipe: jest.fn() }),
};

const scanner = { scan: jest.fn() };
const auditService = { record: jest.fn().mockResolvedValue(null) };

const cleanScan = {
  verdict: ScanVerdict.CLEAN,
  signature: null,
  engine: 'builtin',
  scannedAt: new Date(),
  durationMs: 3,
};
const infectedScan = {
  verdict: ScanVerdict.INFECTED,
  signature: 'Eicar-Test-Signature',
  engine: 'builtin',
  scannedAt: new Date(),
  durationMs: 4,
};
const erroredScan = {
  verdict: ScanVerdict.ERROR,
  signature: null,
  engine: 'clamav',
  scannedAt: new Date(),
  durationMs: 5,
  details: 'connection refused',
};

/** Audit entries recorded for a given action. */
const auditEntriesFor = (action: AuditAction) =>
  auditService.record.mock.calls
    .map(([entry]) => entry)
    .filter((entry) => entry.action === action);

describe('WorkerService', () => {
  let service: WorkerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    created = [];
    for (const key of Object.keys(config)) delete config[key];

    storage.storeInQuarantine.mockResolvedValue({
      storageKey: 'generated-key.pdf',
      area: StorageArea.QUARANTINE,
      absolutePath: '/var/uploads/quarantine/generated-key.pdf',
      size: PDF.length,
      sha256: 'abc123',
    });
    storage.move.mockResolvedValue('/var/uploads/clean/generated-key.pdf');
    storage.exists.mockResolvedValue(true);
    scanner.scan.mockResolvedValue(cleanScan);
    auditService.record.mockResolvedValue(null);

    // No prior uploads: quota checks pass by default.
    mockUploadModel.countDocuments = jest.fn().mockReturnValue(exec(0));
    mockUploadModel.aggregate = jest.fn().mockReturnValue(exec([]));
    mockUploadModel.findById = jest.fn().mockReturnValue(exec(null));
    mockUploadModel.findByIdAndDelete = jest.fn().mockReturnValue(exec(null));
    mockUploadModel.find = jest.fn().mockReturnValue({
      sort: () => ({ limit: () => exec([]) }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        {
          provide: getModelToken(WorkerUpload.name),
          useValue: mockUploadModel,
        },
        { provide: FileStorageService, useValue: storage },
        { provide: MalwareScannerService, useValue: scanner },
        { provide: AuditService, useValue: auditService },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    service = module.get(WorkerService);
  });

  const upload = (buffer = PDF, over: Record<string, unknown> = {}) =>
    service.processUpload(
      {
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
        ...over,
      },
      {},
      'tutor-1',
      audit,
    );

  describe('validation before anything touches disk', () => {
    it('rejects an empty upload', async () => {
      await expect(upload(Buffer.alloc(0))).rejects.toThrow(
        BadRequestException,
      );
      expect(storage.storeInQuarantine).not.toHaveBeenCalled();
    });

    it('rejects a file over the size limit without storing it', async () => {
      config['uploads.maxFileBytes'] = 8;

      await expect(upload()).rejects.toThrow(PayloadTooLargeException);
      expect(storage.storeInQuarantine).not.toHaveBeenCalled();
    });

    it('rejects an executable disguised as a PDF without storing it', async () => {
      await expect(upload(Buffer.from('MZ\x90\x00'))).rejects.toThrow(
        /do not match the declared type/,
      );
      expect(storage.storeInQuarantine).not.toHaveBeenCalled();
      expect(scanner.scan).not.toHaveBeenCalled();
    });

    it('audits a rejected upload as a denial', async () => {
      await expect(upload(Buffer.from('MZ\x90\x00'))).rejects.toThrow();

      const [entry] = auditEntriesFor(AuditAction.FILE_UPLOAD_REJECTED);
      expect(entry.outcome).toBe(AuditOutcome.DENIED);
      expect(entry.context).toBe(audit);
      expect(entry.reason).toMatch(/do not match the declared type/);
    });
  });

  describe('quotas', () => {
    it('rejects once the per-window file count is reached', async () => {
      config['uploads.quota.maxFiles'] = 2;
      mockUploadModel.countDocuments.mockReturnValue(exec(2));

      await expect(upload()).rejects.toThrow(ForbiddenException);
      expect(storage.storeInQuarantine).not.toHaveBeenCalled();
    });

    it('rejects once the stored byte quota would be exceeded', async () => {
      config['uploads.quota.maxBytes'] = 20;
      mockUploadModel.aggregate.mockReturnValue(exec([{ total: 18 }]));

      await expect(upload()).rejects.toThrow(/Storage quota exceeded/);
    });

    it('scopes the quota query to the uploading user', async () => {
      await upload();

      expect(mockUploadModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'tutor-1' }),
      );
    });
  });

  describe('quarantine and release lifecycle', () => {
    it('writes to quarantine and records the upload as pending first', async () => {
      await upload();

      expect(storage.storeInQuarantine).toHaveBeenCalledWith(PDF, '.pdf');
      const [doc] = created;
      expect(doc.storageKey).toBe('generated-key.pdf');
      expect(doc.ownerId).toBe('tutor-1');
    });

    it('never stores the caller-supplied filename as the storage key', async () => {
      await upload(PDF, { originalname: '../../etc/cron.d/evil.pdf' });

      const [doc] = created;
      expect(doc.storageKey).toBe('generated-key.pdf');
      expect(doc.originalName).toBe('evil.pdf');
      expect(doc.originalName).not.toContain('..');
    });

    it('releases a clean file to the clean area', async () => {
      const view = await upload();

      expect(storage.move).toHaveBeenCalledWith(
        'generated-key.pdf',
        StorageArea.QUARANTINE,
        StorageArea.CLEAN,
      );
      expect(view.status).toBe(UploadStatus.CLEAN);
      expect(view.downloadUrl).toContain('/content');
    });

    it('deletes an infected file and never exposes a download URL', async () => {
      scanner.scan.mockResolvedValue(infectedScan);

      const view = await upload(EICAR_PDF);

      expect(view.status).toBe(UploadStatus.INFECTED);
      expect(view.downloadUrl).toBeNull();
      expect(storage.remove).toHaveBeenCalledWith(
        'generated-key.pdf',
        StorageArea.QUARANTINE,
      );
      expect(storage.move).not.toHaveBeenCalled();
    });

    it('retains an infected sample when configured to', async () => {
      config['uploads.retainInfected'] = true;
      scanner.scan.mockResolvedValue(infectedScan);

      const view = await upload(EICAR_PDF);

      expect(storage.move).toHaveBeenCalledWith(
        'generated-key.pdf',
        StorageArea.QUARANTINE,
        StorageArea.INFECTED,
      );
      expect(view.status).toBe(UploadStatus.INFECTED);
      expect(view.downloadUrl).toBeNull();
    });

    it('leaves an unscannable file quarantined rather than releasing it', async () => {
      scanner.scan.mockResolvedValue(erroredScan);

      const view = await upload();

      expect(view.status).toBe(UploadStatus.ERROR);
      expect(view.downloadUrl).toBeNull();
      expect(storage.move).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });

  describe('scan auditing', () => {
    it('audits quarantine, scan and release for a clean file', async () => {
      await upload();

      expect(auditEntriesFor(AuditAction.FILE_UPLOAD_QUARANTINED)).toHaveLength(
        1,
      );
      expect(auditEntriesFor(AuditAction.FILE_UPLOAD_SCANNED)).toHaveLength(1);
      expect(auditEntriesFor(AuditAction.FILE_UPLOAD_RELEASED)).toHaveLength(1);
    });

    it('records the verdict, signature and engine on the scan entry', async () => {
      scanner.scan.mockResolvedValue(infectedScan);

      await upload(EICAR_PDF);

      const [entry] = auditEntriesFor(AuditAction.FILE_UPLOAD_SCANNED);
      expect(entry.outcome).toBe(AuditOutcome.FAILURE);
      expect(entry.after).toEqual(
        expect.objectContaining({
          verdict: ScanVerdict.INFECTED,
          signature: 'Eicar-Test-Signature',
          engine: 'builtin',
          status: UploadStatus.INFECTED,
        }),
      );
      expect(entry.reason).toBe('Eicar-Test-Signature');
    });

    it('does not record a release entry for an infected file', async () => {
      scanner.scan.mockResolvedValue(infectedScan);

      await upload(EICAR_PDF);

      expect(auditEntriesFor(AuditAction.FILE_UPLOAD_RELEASED)).toHaveLength(0);
    });

    it('records the scanner failure reason on an errored scan', async () => {
      scanner.scan.mockResolvedValue(erroredScan);

      await upload();

      const [entry] = auditEntriesFor(AuditAction.FILE_UPLOAD_SCANNED);
      expect(entry.reason).toBe('connection refused');
    });
  });

  describe('openDownload', () => {
    const storedUpload = (over: Record<string, unknown> = {}) => ({
      id: 'up-1',
      ownerId: 'tutor-1',
      storageKey: 'generated-key.pdf',
      storageArea: StorageArea.CLEAN,
      status: UploadStatus.CLEAN,
      mimeType: 'application/pdf',
      originalName: 'doc.pdf',
      ...over,
    });

    it('serves a released file', async () => {
      mockUploadModel.findById.mockReturnValue(exec(storedUpload()));

      const { upload: doc } = await service.openDownload('up-1', 'tutor-1');

      expect(doc.status).toBe(UploadStatus.CLEAN);
      expect(storage.createReadStream).toHaveBeenCalledWith(
        'generated-key.pdf',
        StorageArea.CLEAN,
      );
    });

    it.each([
      UploadStatus.PENDING,
      UploadStatus.SCANNING,
      UploadStatus.INFECTED,
      UploadStatus.ERROR,
    ])('refuses to serve a file in status %s', async (status) => {
      mockUploadModel.findById.mockReturnValue(exec(storedUpload({ status })));

      await expect(service.openDownload('up-1', 'tutor-1')).rejects.toThrow(
        ConflictException,
      );
      expect(storage.createReadStream).not.toHaveBeenCalled();
    });

    it("hides another user's upload behind a 404", async () => {
      mockUploadModel.findById.mockReturnValue(exec(storedUpload()));

      await expect(
        service.openDownload('up-1', 'someone-else', 'tutor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets a platform admin read any upload', async () => {
      mockUploadModel.findById.mockReturnValue(exec(storedUpload()));

      await expect(
        service.openDownload('up-1', 'platform-admin', 'admin'),
      ).resolves.toBeDefined();
    });

    it('404s when the metadata survives but the bytes do not', async () => {
      mockUploadModel.findById.mockReturnValue(exec(storedUpload()));
      storage.exists.mockResolvedValue(false);

      await expect(service.openDownload('up-1', 'tutor-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteUpload', () => {
    it('removes the bytes and audits the deletion', async () => {
      const doc = {
        id: 'up-1',
        ownerId: 'tutor-1',
        storageKey: 'generated-key.pdf',
        storageArea: StorageArea.CLEAN,
        status: UploadStatus.CLEAN,
        sha256: 'abc123',
      };
      mockUploadModel.findById.mockReturnValue(exec(doc));
      mockUploadModel.findByIdAndDelete.mockReturnValue(exec(doc));

      await service.deleteUpload('up-1', 'tutor-1', 'tutor', audit);

      expect(storage.remove).toHaveBeenCalledWith(
        'generated-key.pdf',
        StorageArea.CLEAN,
      );
      expect(auditEntriesFor(AuditAction.FILE_UPLOAD_DELETED)).toHaveLength(1);
    });

    it("refuses to delete another user's upload", async () => {
      mockUploadModel.findById.mockReturnValue(
        exec({ id: 'up-1', ownerId: 'someone-else' }),
      );

      await expect(
        service.deleteUpload('up-1', 'tutor-1', 'tutor', audit),
      ).rejects.toThrow(NotFoundException);
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });
});

describe('parseTags', () => {
  it('splits, trims and drops blanks', () => {
    expect(parseTags(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list for missing input', () => {
    expect(parseTags(undefined)).toEqual([]);
  });

  it('caps the number of tags', () => {
    const many = Array.from({ length: 50 }, (_, i) => `t${i}`).join(',');

    expect(parseTags(many)).toHaveLength(20);
  });
});
