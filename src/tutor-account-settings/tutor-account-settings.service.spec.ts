import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum';
import { TutorAccountSettings } from './schemas/tutor-account-settings.schema';
import { TutorAccountSettingsService } from './tutor-account-settings.service';

const OWNER = { id: 'tutor-owner', role: Role.TUTOR };
const ATTACKER = { id: 'tutor-attacker', role: Role.TUTOR };
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
    tutorId: OWNER.id,
    displayName: null,
    language: 'en',
    timezone: 'UTC',
    emailNotifications: true,
    newCourseEnrollmentNotifications: true,
    studentMessageNotifications: true,
    reviewNotifications: true,
    availabilityStatus: 'available',
    profileVisibility: 'private',
    ...over,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};

describe('TutorAccountSettingsService ownership', () => {
  let service: TutorAccountSettingsService;
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
        TutorAccountSettingsService,
        {
          provide: getModelToken(TutorAccountSettings.name),
          useValue: model,
        },
      ],
    }).compile();

    service = module.get(TutorAccountSettingsService);
  });

  describe('reads', () => {
    it('scopes the caller lookup to the JWT subject', async () => {
      await service.findMine(OWNER);
      expect(model.findOne).toHaveBeenCalledWith({ tutorId: OWNER.id });
    });

    it('creates a default row for a first-time caller under their own id', async () => {
      await service.findMine(OWNER);
      expect(model.create).toHaveBeenCalledWith({ tutorId: OWNER.id });
    });

    it('lets the owner read their record by id', async () => {
      await expect(service.findOne(SETTINGS_ID, OWNER)).resolves.toMatchObject({
        tutorId: OWNER.id,
      });
    });

    it("rejects another tutor reading the owner's record", async () => {
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
        tutorId: OWNER.id,
      });
    });

    it("refuses to update another tutor's record", async () => {
      await expect(
        service.update(SETTINGS_ID, { language: 'fr' }, ATTACKER),
      ).rejects.toThrow(ForbiddenException);
    });

    it("does not let staff rewrite a tutor's preferences", async () => {
      await expect(
        service.update(SETTINGS_ID, { language: 'fr' }, ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('applies the update for the owner', async () => {
      const updated = await service.update(
        SETTINGS_ID,
        { language: 'fr', emailNotifications: false },
        OWNER,
      );

      expect(updated).toMatchObject({
        language: 'fr',
        emailNotifications: false,
      });
    });

    it("refuses to delete another tutor's record", async () => {
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

  describe('tutor-specific preferences', () => {
    it('applies availability status change', async () => {
      const updated = await service.update(
        SETTINGS_ID,
        { availabilityStatus: 'busy' },
        OWNER,
      );
      expect(updated).toMatchObject({ availabilityStatus: 'busy' });
    });

    it('applies notification preference changes', async () => {
      const updated = await service.update(
        SETTINGS_ID,
        {
          newCourseEnrollmentNotifications: false,
          studentMessageNotifications: false,
          reviewNotifications: false,
        },
        OWNER,
      );
      expect(updated).toMatchObject({
        newCourseEnrollmentNotifications: false,
        studentMessageNotifications: false,
        reviewNotifications: false,
      });
    });

    it('applies profile visibility change', async () => {
      const updated = await service.update(
        SETTINGS_ID,
        { profileVisibility: 'public' },
        OWNER,
      );
      expect(updated).toMatchObject({ profileVisibility: 'public' });
    });

    it('applies multiple preferences in one update', async () => {
      const updated = await service.update(
        SETTINGS_ID,
        {
          displayName: 'Dr. Smith',
          language: 'es',
          timezone: 'America/Mexico_City',
          availabilityStatus: 'unavailable',
          profileVisibility: 'public',
        },
        OWNER,
      );
      expect(updated).toMatchObject({
        displayName: 'Dr. Smith',
        language: 'es',
        timezone: 'America/Mexico_City',
        availabilityStatus: 'unavailable',
        profileVisibility: 'public',
      });
    });
  });
});
