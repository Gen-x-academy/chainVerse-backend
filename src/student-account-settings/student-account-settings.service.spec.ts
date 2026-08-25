import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum';
import { StudentAccountSettings } from './schemas/student-account-settings.schema';
import { StudentAccountSettingsService } from './student-account-settings.service';

const OWNER = { id: 'student-owner', role: Role.STUDENT };
const ATTACKER = { id: 'student-attacker', role: Role.STUDENT };
const ADMIN = { id: 'admin-1', role: Role.ADMIN };

const SETTINGS_ID = '507f1f77bcf86cd799439011';

const chain = <T>(value: T) => {
  const link: Record<string, unknown> = {
    exec: jest.fn().mockResolvedValue(value),
  };
  link.sort = jest.fn().mockReturnValue(link);
  return link;
};

const settingsDoc = (over: Record<string, unknown> = {}) => {
  const doc: Record<string, unknown> = {
    _id: SETTINGS_ID,
    id: SETTINGS_ID,
    studentId: OWNER.id,
    displayName: null,
    language: 'en',
    timezone: 'UTC',
    emailNotifications: true,
    marketingEmails: false,
    profileVisibility: 'private',
    ...over,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};

describe('StudentAccountSettingsService ownership', () => {
  let service: StudentAccountSettingsService;
  let model: any;

  beforeEach(async () => {
    model = {
      find: jest.fn().mockReturnValue(chain([settingsDoc()])),
      findOne: jest.fn().mockReturnValue(chain(null)),
      findById: jest.fn().mockReturnValue(chain(settingsDoc())),
      create: jest.fn((payload) => Promise.resolve(settingsDoc(payload))),
      deleteOne: jest.fn().mockReturnValue(chain({ deletedCount: 1 })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentAccountSettingsService,
        {
          provide: getModelToken(StudentAccountSettings.name),
          useValue: model,
        },
      ],
    }).compile();

    service = module.get(StudentAccountSettingsService);
  });

  describe('reads', () => {
    it('scopes the caller lookup to the JWT subject', async () => {
      await service.findMine(OWNER);
      expect(model.findOne).toHaveBeenCalledWith({ studentId: OWNER.id });
    });

    it('creates a default row for a first-time caller under their own id', async () => {
      await service.findMine(OWNER);
      expect(model.create).toHaveBeenCalledWith({ studentId: OWNER.id });
    });

    it('lets the owner read their record by id', async () => {
      await expect(service.findOne(SETTINGS_ID, OWNER)).resolves.toMatchObject({
        studentId: OWNER.id,
      });
    });

    it("rejects another student reading the owner's record", async () => {
      await expect(service.findOne(SETTINGS_ID, ATTACKER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows staff to read any record', async () => {
      await expect(service.findOne(SETTINGS_ID, ADMIN)).resolves.toBeDefined();
    });

    it('404s on an unknown id rather than leaking a different record', async () => {
      model.findById.mockReturnValue(chain(null));
      await expect(service.findOne(SETTINGS_ID, OWNER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('writes', () => {
    it('always stamps the caller as the owner on create', async () => {
      await service.create({ displayName: 'Ada' }, OWNER);
      expect(model.create).toHaveBeenCalledWith({
        displayName: 'Ada',
        studentId: OWNER.id,
      });
    });

    it("refuses to update another student's record", async () => {
      await expect(
        service.update(SETTINGS_ID, { language: 'fr' }, ATTACKER),
      ).rejects.toThrow(ForbiddenException);
    });

    it("does not let staff rewrite a student's preferences", async () => {
      await expect(
        service.update(SETTINGS_ID, { language: 'fr' }, ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('applies the update for the owner', async () => {
      const updated = await service.update(
        SETTINGS_ID,
        { language: 'fr', marketingEmails: true },
        OWNER,
      );

      expect(updated).toMatchObject({ language: 'fr', marketingEmails: true });
    });

    it("refuses to delete another student's record", async () => {
      await expect(service.remove(SETTINGS_ID, ATTACKER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(model.deleteOne).not.toHaveBeenCalled();
    });

    it('lets the owner delete their own record', async () => {
      await expect(service.remove(SETTINGS_ID, OWNER)).resolves.toEqual({
        id: SETTINGS_ID,
        deleted: true,
      });
    });

    it('lets staff delete a record for account closure', async () => {
      await expect(service.remove(SETTINGS_ID, ADMIN)).resolves.toEqual({
        id: SETTINGS_ID,
        deleted: true,
      });
    });
  });
});
