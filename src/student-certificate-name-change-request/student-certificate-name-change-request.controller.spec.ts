import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentCertificateNameChangeRequestController } from './student-certificate-name-change-request.controller';
import { StudentCertificateNameChangeRequestService } from './student-certificate-name-change-request.service';

const OWNER = { sub: 'student-owner', role: Role.STUDENT };
const ATTACKER = { sub: 'student-attacker', role: Role.STUDENT };
const ADMIN = { sub: 'admin-1', role: Role.ADMIN };

const REQUEST_ID = '507f1f77bcf86cd799439011';

describe('StudentCertificateNameChangeRequestController', () => {
  let controller: StudentCertificateNameChangeRequestController;
  // `any`, not `jest.Mocked<T>`: a typed reference makes
  // `expect(service.method)` trip @typescript-eslint/unbound-method below,
  // same as the `any`-typed model mocks used throughout the other specs.
  let service: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentCertificateNameChangeRequestController],
      providers: [
        {
          provide: StudentCertificateNameChangeRequestService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findMine: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            create: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            update: jest.fn().mockResolvedValue({ studentId: OWNER.sub }),
            review: jest.fn().mockResolvedValue({ status: 'approved' }),
            remove: jest.fn().mockResolvedValue({ id: REQUEST_ID }),
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

    controller = module.get(StudentCertificateNameChangeRequestController);
    service = module.get(StudentCertificateNameChangeRequestService);
  });

  it('files a request under the caller, with no owner field from the body', async () => {
    await controller.create(
      { currentName: 'Ada Lovlace', requestedName: 'Ada Lovelace' },
      OWNER.sub,
      OWNER.role,
    );

    expect(service.create).toHaveBeenCalledWith(
      { currentName: 'Ada Lovlace', requestedName: 'Ada Lovelace' },
      { id: OWNER.sub, role: OWNER.role },
    );
  });

  it('scopes the caller listing to the JWT subject', async () => {
    await controller.findMine(OWNER.sub, OWNER.role);
    expect(service.findMine).toHaveBeenCalledWith({
      id: OWNER.sub,
      role: OWNER.role,
    });
  });

  it('checks a probed id against the caller identity, not the path', async () => {
    service.findOne.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      controller.findOne(REQUEST_ID, ATTACKER.sub, ATTACKER.role),
    ).rejects.toThrow(ForbiddenException);
    expect(service.findOne).toHaveBeenCalledWith(REQUEST_ID, {
      id: ATTACKER.sub,
      role: ATTACKER.role,
    });
  });

  it('propagates cross-account update rejection', async () => {
    service.update.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      controller.update(
        REQUEST_ID,
        { requestedName: 'Mallory' },
        ATTACKER.sub,
        ATTACKER.role,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('records the deciding staff member on review', async () => {
    await controller.review(
      REQUEST_ID,
      { decision: 'approved' },
      ADMIN.sub,
      ADMIN.role,
    );

    expect(service.review).toHaveBeenCalledWith(
      REQUEST_ID,
      { decision: 'approved' },
      { id: ADMIN.sub, role: ADMIN.role },
    );
  });

  it('propagates cross-account delete rejection', async () => {
    service.remove.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      controller.remove(REQUEST_ID, ATTACKER.sub, ATTACKER.role),
    ).rejects.toThrow(ForbiddenException);
  });
});
