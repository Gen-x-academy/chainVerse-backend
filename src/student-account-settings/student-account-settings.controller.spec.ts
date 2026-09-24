import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentAccountSettingsController } from './student-account-settings.controller';
import { StudentAccountSettingsService } from './student-account-settings.service';

const OWNER = { sub: 'student-owner', role: Role.STUDENT };
const ATTACKER = { sub: 'student-attacker', role: Role.STUDENT };

const SETTINGS_ID = '507f1f77bcf86cd799439011';

describe('StudentAccountSettingsController', () => {
  let controller: StudentAccountSettingsController;
  // `any`, not `jest.Mocked<T>`: a typed reference makes
  // `expect(service.method)` trip @typescript-eslint/unbound-method below,
  // same as the `any`-typed model mocks used throughout the other specs.
  let service: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentAccountSettingsController],
      providers: [
        {
          provide: StudentAccountSettingsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findMine: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            findOne: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            create: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            update: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            updateMine: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            remove: jest.fn().mockResolvedValue({ id: SETTINGS_ID }),
          },
        },
      ],
    })
      // Guard behaviour is covered by the guards' own specs; here we test that
      // the handlers hand the JWT identity down to the service unchanged.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(StudentAccountSettingsController);
    service = module.get(StudentAccountSettingsService);
  });

  it('passes the JWT identity, not a client-supplied one, to the service', async () => {
    await controller.findMine(OWNER.sub, OWNER.role);
    expect(service.findMine).toHaveBeenCalledWith({
      id: OWNER.sub,
      role: OWNER.role,
    });
  });

  it('stamps create with the caller identity', async () => {
    await controller.create({ displayName: 'Ada' }, OWNER.sub, OWNER.role);
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

    // The id in the path never becomes the identity the check runs against.
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
});
