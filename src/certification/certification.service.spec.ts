import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { Role } from '../common/enums/role.enum';
import {
  AuthException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { CertificateTx } from '../stellar/schemas/certificate-tx.schema';
import { CERTIFICATE_DOWNLOAD_TOKEN_TYPE } from './certification.constants';
import { CertificationService } from './certification.service';

const JWT_SECRET = 'unit-test-jwt-secret-key-32chars!!';
const CERTIFICATE_ID = 'cert-abc-123';
const OWNER = { id: 'student-owner', role: Role.STUDENT };
const ATTACKER = { id: 'student-attacker', role: Role.STUDENT };
const ADMIN = { id: 'admin-1', role: Role.ADMIN };

const certificateDoc = (over: Record<string, unknown> = {}) => ({
  certificateId: CERTIFICATE_ID,
  studentId: OWNER.id,
  transactionHash: 'tx-hash-1',
  status: 'confirmed',
  ...over,
});

const chain = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('CertificationService download links', () => {
  let service: CertificationService;
  let jwtService: JwtService;
  let certTxModel: { findOne: jest.Mock };

  beforeEach(async () => {
    certTxModel = {
      findOne: jest.fn().mockReturnValue(chain(certificateDoc())),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { algorithm: 'HS256' },
        }),
      ],
      providers: [
        CertificationService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'downloadTokenExpiry') return 3600;
              if (key === 'baseUrl') return 'http://localhost:3000';
              return undefined;
            },
          },
        },
        {
          provide: getModelToken(CertificateTx.name),
          useValue: certTxModel,
        },
      ],
    }).compile();

    service = module.get(CertificationService);
    jwtService = module.get(JwtService);
  });

  describe('createDownloadLink', () => {
    it('returns a signed URL bound to the certificate and requester', async () => {
      const link = await service.createDownloadLink(CERTIFICATE_ID, OWNER);

      expect(link.expiresIn).toBe(3600);
      expect(link.downloadUrl).toContain(
        `/api/v1/certification/${CERTIFICATE_ID}/download?token=`,
      );

      const token = new URL(link.downloadUrl).searchParams.get('token');
      expect(token).toBeTruthy();

      const claims = service.verifyDownloadToken(token!, CERTIFICATE_ID);
      expect(claims.sub).toBe(OWNER.id);
      expect(claims.certificateId).toBe(CERTIFICATE_ID);
      expect(claims.type).toBe(CERTIFICATE_DOWNLOAD_TOKEN_TYPE);
    });

    it('allows staff to create a link for any certificate', async () => {
      await expect(
        service.createDownloadLink(CERTIFICATE_ID, ADMIN),
      ).resolves.toMatchObject({ expiresIn: 3600 });
    });

    it('rejects non-owners who are not staff', async () => {
      await expect(
        service.createDownloadLink(CERTIFICATE_ID, ATTACKER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects unknown certificates', async () => {
      certTxModel.findOne.mockReturnValue(chain(null));

      await expect(
        service.createDownloadLink('missing-cert', OWNER),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.RES_CERTIFICATE_NOT_FOUND,
      });
    });
  });

  describe('verifyDownloadToken tampering resistance', () => {
    it('rejects missing tokens on download', async () => {
      await expect(
        service.downloadCertificate(CERTIFICATE_ID, undefined),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.VAL_MISSING_FIELD,
      });
      await expect(
        service.downloadCertificate(CERTIFICATE_ID, '   '),
      ).rejects.toBeInstanceOf(ValidationDomainException);
    });

    it('rejects expired tokens', () => {
      const expired = jwtService.sign(
        {
          sub: OWNER.id,
          certificateId: CERTIFICATE_ID,
          type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
        },
        { expiresIn: -1 },
      );

      expect(() =>
        service.verifyDownloadToken(expired, CERTIFICATE_ID),
      ).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_EXPIRED,
        }),
      );
    });

    it('rejects tokens signed with the wrong secret', () => {
      const tampered = jwt.sign(
        {
          sub: OWNER.id,
          certificateId: CERTIFICATE_ID,
          type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
        },
        'wrong-secret-key-that-is-long-enough!!',
        { algorithm: 'HS256', expiresIn: 3600 },
      );

      expect(() =>
        service.verifyDownloadToken(tampered, CERTIFICATE_ID),
      ).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_INVALID,
        }),
      );
    });

    it('rejects tokens repurposed for a different certificate id', () => {
      const token = jwtService.sign(
        {
          sub: OWNER.id,
          certificateId: CERTIFICATE_ID,
          type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
        },
        { expiresIn: 3600 },
      );

      expect(() =>
        service.verifyDownloadToken(token, 'other-certificate'),
      ).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_MISMATCH,
        }),
      );
    });

    it('rejects access tokens and other JWT types', () => {
      const accessToken = jwtService.sign(
        { sub: OWNER.id, role: Role.STUDENT, type: 'access' },
        { expiresIn: 3600 },
      );

      expect(() =>
        service.verifyDownloadToken(accessToken, CERTIFICATE_ID),
      ).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_INVALID,
        }),
      );
    });

    it('rejects manually tampered payload segments', () => {
      const token = jwtService.sign(
        {
          sub: OWNER.id,
          certificateId: CERTIFICATE_ID,
          type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
        },
        { expiresIn: 3600 },
      );
      const [header, , signature] = token.split('.');
      const forgedBody = Buffer.from(
        JSON.stringify({
          sub: ATTACKER.id,
          certificateId: CERTIFICATE_ID,
          type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const forgedToken = `${header}.${forgedBody}.${signature}`;

      expect(() =>
        service.verifyDownloadToken(forgedToken, CERTIFICATE_ID),
      ).toThrow(AuthException);
    });
  });

  describe('downloadCertificate', () => {
    it('returns the certificate file when the token is valid', async () => {
      const { downloadUrl } = await service.createDownloadLink(
        CERTIFICATE_ID,
        OWNER,
      );
      const token = new URL(downloadUrl).searchParams.get('token')!;

      const file = await service.downloadCertificate(CERTIFICATE_ID, token);
      expect(file.toString('utf8')).toContain(CERTIFICATE_ID);
    });
  });
});
