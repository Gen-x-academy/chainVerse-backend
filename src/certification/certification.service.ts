import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  assertOwnerOrStaff,
  RequestActor,
} from '../common/auth/resource-owner';
import {
  AuthException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  CertificateTx,
  CertificateTxDocument,
} from '../stellar/schemas/certificate-tx.schema';
import { CERTIFICATE_DOWNLOAD_TOKEN_TYPE } from './certification.constants';
import { CertificateDownloadLinkDto } from './dto/certificate-download-link.dto';

export interface CertificateDownloadTokenClaims {
  sub: string;
  certificateId: string;
  type: typeof CERTIFICATE_DOWNLOAD_TOKEN_TYPE;
}

@Injectable()
export class CertificationService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(CertificateTx.name)
    private readonly certTxModel: Model<CertificateTxDocument>,
  ) {}

  async createDownloadLink(
    certificateId: string,
    actor: RequestActor,
  ): Promise<CertificateDownloadLinkDto> {
    const certificate = await this.findCertificateOrThrow(certificateId);
    assertOwnerOrStaff(certificate.studentId, actor, 'certificate');

    const expiresIn = this.configService.get<number>('downloadTokenExpiry')!;
    const token = this.jwtService.sign(
      {
        sub: actor.id,
        certificateId,
        type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
      },
      { expiresIn },
    );

    const baseUrl = this.configService.get<string>('baseUrl')!.replace(/\/$/, '');
    const downloadUrl = `${baseUrl}/api/v1/certification/${encodeURIComponent(certificateId)}/download?token=${encodeURIComponent(token)}`;

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      expiresIn,
    };
  }

  async downloadCertificate(
    certificateId: string,
    token: string | undefined,
  ): Promise<Buffer> {
    if (!token?.trim()) {
      throw new ValidationDomainException(
        'Download token is required',
        ErrorCode.VAL_MISSING_FIELD,
      );
    }

    const claims = this.verifyDownloadToken(token, certificateId);
    await this.findCertificateOrThrow(claims.certificateId);

    return this.generateCertificateFile(certificateId);
  }

  verifyDownloadToken(
    token: string,
    expectedCertificateId: string,
  ): CertificateDownloadTokenClaims {
    let payload: Record<string, unknown>;

    try {
      payload = this.jwtService.verify<Record<string, unknown>>(token);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TokenExpiredError') {
        throw new AuthException(
          'Certificate download link has expired',
          ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_EXPIRED,
        );
      }
      throw new AuthException(
        'Certificate download link is invalid',
        ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_INVALID,
      );
    }

    if (payload.type !== CERTIFICATE_DOWNLOAD_TOKEN_TYPE) {
      throw new AuthException(
        'Certificate download link is invalid',
        ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_INVALID,
      );
    }

    if (
      typeof payload.certificateId !== 'string' ||
      payload.certificateId !== expectedCertificateId
    ) {
      throw new AuthException(
        'Certificate download link does not match this certificate',
        ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_MISMATCH,
      );
    }

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new AuthException(
        'Certificate download link is invalid',
        ErrorCode.AUTH_CERTIFICATE_DOWNLOAD_TOKEN_INVALID,
      );
    }

    return {
      sub: payload.sub,
      certificateId: payload.certificateId,
      type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
    };
  }

  generateCertificateFile(certificateId: string): Buffer {
    const fileContents = `ChainVerse certificate download placeholder for ${certificateId}`;
    return Buffer.from(fileContents, 'utf8');
  }

  private async findCertificateOrThrow(
    certificateId: string,
  ): Promise<CertificateTxDocument> {
    const certificate = await this.certTxModel
      .findOne({ certificateId })
      .exec();

    if (!certificate) {
      throw new ResourceNotFoundException(
        `Certificate ${certificateId} was not found`,
        ErrorCode.RES_CERTIFICATE_NOT_FOUND,
      );
    }

    return certificate;
  }
}
