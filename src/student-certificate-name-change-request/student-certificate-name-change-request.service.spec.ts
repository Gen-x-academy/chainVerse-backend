import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum';
import { CertificateNameChangeRequest } from './schemas/certificate-name-change-request.schema';
import { StudentCertificateNameChangeRequestService } from './student-certificate-name-change-request.service';

const OWNER = { id: 'student-owner', role: Role.STUDENT };
const ATTACKER = { id: 'student-attacker', role: Role.STUDENT };
const ADMIN = { id: 'admin-1', role: Role.ADMIN };

const REQUEST_ID = '507f1f77bcf86cd799439011';

const chain = <T>(value: T) => {
  const link: Record<string, unknown> = {
    exec: jest.fn().mockResolvedValue(value),
  };
  link.sort = jest.fn().mockReturnValue(link);
  return link;
};

const requestDoc = (over: Record<string, unknown> = {}) => {
  const doc: Record<string, unknown> = {
    _id: REQUEST_ID,
    id: REQUEST_ID,
    studentId: OWNER.id,
    currentName: 'Ada Lovlace',
    requestedName: 'Ada Lovelace',
    reason: null,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    decisionNote: null,
    ...over,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
};

describe('StudentCertificateNameChangeRequestService ownership', () => {
  let service: StudentCertificateNameChangeRequestService;
  let model: any;

  beforeEach(async () => {
    model = {
      find: jest.fn().mockReturnValue(chain([requestDoc()])),
      findOne: jest.fn().mockReturnValue(chain(null)),
      findById: jest.fn().mockReturnValue(chain(requestDoc())),
      create: jest.fn((payload) => Promise.resolve(requestDoc(payload))),
      deleteOne: jest.fn().mockReturnValue(chain({ deletedCount: 1 })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentCertificateNameChangeRequestService,
        {
          provide: getModelToken(CertificateNameChangeRequest.name),
          useValue: model,
        },
      ],
    }).compile();

    service = module.get(StudentCertificateNameChangeRequestService);
  });

  describe('creation', () => {
    it('files the request under the JWT subject, ignoring any other identity', async () => {
      await service.create(
        { currentName: 'Ada Lovlace', requestedName: 'Ada Lovelace' },
        OWNER,
      );

      expect(model.create).toHaveBeenCalledWith({
        studentId: OWNER.id,
        currentName: 'Ada Lovlace',
        requestedName: 'Ada Lovelace',
        reason: null,
      });
    });

    it('refuses a second pending request from the same student', async () => {
      model.findOne.mockReturnValue(chain(requestDoc()));

      await expect(
        service.create(
          { currentName: 'Ada Lovlace', requestedName: 'Ada Lovelace' },
          OWNER,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reads', () => {
    it('scopes the caller listing to their own id', async () => {
      await service.findMine(OWNER);
      expect(model.find).toHaveBeenCalledWith({ studentId: OWNER.id });
    });

    it('lets the owner read their request', async () => {
      await expect(service.findOne(REQUEST_ID, OWNER)).resolves.toMatchObject({
        studentId: OWNER.id,
      });
    });

    it("rejects another student reading the owner's request", async () => {
      await expect(service.findOne(REQUEST_ID, ATTACKER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows staff to read any request for review', async () => {
      await expect(service.findOne(REQUEST_ID, ADMIN)).resolves.toBeDefined();
    });

    it('404s on an unknown id', async () => {
      model.findById.mockReturnValue(chain(null));
      await expect(service.findOne(REQUEST_ID, OWNER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('writes', () => {
    it("refuses to edit another student's request", async () => {
      await expect(
        service.update(REQUEST_ID, { requestedName: 'Mallory' }, ATTACKER),
      ).rejects.toThrow(ForbiddenException);
    });

    it("refuses to let staff edit a student's request content", async () => {
      await expect(
        service.update(REQUEST_ID, { requestedName: 'Mallory' }, ADMIN),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the owner edit while the request is pending', async () => {
      await expect(
        service.update(REQUEST_ID, { requestedName: 'Ada King' }, OWNER),
      ).resolves.toMatchObject({ requestedName: 'Ada King' });
    });

    it('freezes the request once it has been decided', async () => {
      model.findById.mockReturnValue(chain(requestDoc({ status: 'approved' })));

      await expect(
        service.update(REQUEST_ID, { requestedName: 'Ada King' }, OWNER),
      ).rejects.toThrow(BadRequestException);
    });

    it('records the reviewing staff member on a decision', async () => {
      const reviewed = await service.review(
        REQUEST_ID,
        { decision: 'approved', note: 'ID checked' },
        ADMIN,
      );

      expect(reviewed).toMatchObject({
        status: 'approved',
        reviewedBy: ADMIN.id,
        decisionNote: 'ID checked',
      });
    });

    it('refuses to decide an already-decided request', async () => {
      model.findById.mockReturnValue(chain(requestDoc({ status: 'rejected' })));

      await expect(
        service.review(REQUEST_ID, { decision: 'approved' }, ADMIN),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuses to withdraw another student's request", async () => {
      await expect(service.remove(REQUEST_ID, ATTACKER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(model.deleteOne).not.toHaveBeenCalled();
    });

    it('lets the owner withdraw a pending request', async () => {
      await expect(service.remove(REQUEST_ID, OWNER)).resolves.toEqual({
        id: REQUEST_ID,
        deleted: true,
      });
    });

    it('stops the owner withdrawing an approved request', async () => {
      model.findById.mockReturnValue(chain(requestDoc({ status: 'approved' })));

      await expect(service.remove(REQUEST_ID, OWNER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lets staff delete any request', async () => {
      model.findById.mockReturnValue(
        chain(requestDoc({ studentId: 'someone-else', status: 'approved' })),
      );

      await expect(service.remove(REQUEST_ID, ADMIN)).resolves.toEqual({
        id: REQUEST_ID,
        deleted: true,
      });
    });
  });
});
