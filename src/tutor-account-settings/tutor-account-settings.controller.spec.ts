import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TutorAccountSettingsController } from './tutor-account-settings.controller';
import { TutorAccountSettingsService } from './tutor-account-settings.service';

const OWNER = { sub: 'tutor-owner', role: Role.TUTOR };
const ATTACKER = { sub: 'tutor-attacker', role: Role.TUTOR };

const SETTINGS_ID = '507f1f77bcf86cd799439011';

describe('TutorAccountSettingsController', () => {
  let controller: TutorAccountSettingsController;
  let service: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TutorAccountSettingsController],
      providers: [
        {
          provide: TutorAccountSettingsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findMine: jest.fn().mockResolvedValue({ tutorId: OWNER.sub }),
            findOne: jest.fn().mockResolvedValue({ tutorId: OWNER.sub }),
            create: jest.fn().mockResolvedValue({ tutorId: OWNER.sub }),
            update: jest.fn().mockResolvedValue({ tutorId: OWNER.sub }),
            updateMine: jest.fn().mockResolvedValue({ tutorId: OWNER.sub }),
            remove: jest.fn().mockResolvedValue({ id: SETTINGS_ID }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TutorAccountSettingsController);
    service = module.get(TutorAccountSettingsService);
  });

  it('passes the JWT identity, not a client-supplied one, to the service', async () => {
    await controller.findMine(OWNER.sub, OWNER.role);
    expect(service.findMine).toHaveBeenCalledWith({
      id: OWNER.sub,
      role: OWNER.role,
    });
  });

  it('stamps create with the caller identity', async () => {
    await controller.create(
      { displayName: 'Ada' },
      OWNER.sub,
      OWNER.role,
    );
    expect(service.create).toHaveBeenCalledWith(
      { displayName: 'Ada' },
      { id: OWNER.sub, role: OWNER.role },
    );
  });

  it("forwards the attacker's own identity when they probe another id", async () => {
    service.findOne.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      controller.findOne(SETTINGS_ID, ATTACKER.sub, ATTACKER.role),
    ).rejects.toThrow(ForbiddenException);

    expect(service.findOne).toHaveBeenCalledWith(SETTINGS_ID, {
      id: ATTACKER.sub,
      role: ATTACKER.role,
    });
  });

  it('propagates the ownership failure on update instead of swallowing it', async () => {
    service.update.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      controller.update(
        SETTINGS_ID,
        { language: 'fr' },
        ATTACKER.sub,
        ATTACKER.role,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('propagates the ownership failure on delete', async () => {
    service.remove.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      controller.remove(SETTINGS_ID, ATTACKER.sub, ATTACKER.role),
    ).rejects.toThrow(ForbiddenException);
  });

  it('passes updateMine with caller identity', async () => {
    await controller.updateMine(
      { availabilityStatus: 'busy' },
      OWNER.sub,
      OWNER.role,
    );
    expect(service.updateMine).toHaveBeenCalledWith(
      { availabilityStatus: 'busy' },
      { id: OWNER.sub, role: OWNER.role },
    );
  });
});
