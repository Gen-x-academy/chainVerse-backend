import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';

import {
  CreateRenditionAccessTokenDto,
  RenditionAccessPurpose,
} from './dto/create-rendition-access-token.dto';
import { RenditionAccessToken } from './entities/rendition-access-token.entity';
import { DigitalRenditionStorageService } from './digital-renditions.storage';

export type LoanStatus = 'ACTIVE' | 'RETURNED' | 'REVOKED' | 'EXPIRED';

export interface PatronLoan {
  id: string;
  patronId: string;
  renditionId: string;
  status: LoanStatus;
}

export interface Rendition {
  id: string;
  filename: string;
  contentType: string;
}

/**
 * Adapter interfaces — replace with the actual repositories/services
 * from the project's loan and rendition domains.
 */
export interface LoanRepository {
  findActiveForPatronAndRendition(
    patronId: string,
    renditionId: string,
  ): Promise<PatronLoan | null>;

  findForPatron(loanId: string, patronId: string): Promise<PatronLoan | null>;
}

export interface RenditionRepository {
  findById(id: string): Promise<Rendition | null>;
}

@Injectable()
export class DigitalRenditionsService {
  constructor(
    @InjectRepository(RenditionAccessToken)
    private readonly accessTokenRepository: Repository<RenditionAccessToken>,

    private readonly storage: DigitalRenditionStorageService,

    private readonly loans: LoanRepository,

    private readonly renditions: RenditionRepository,
  ) {}

  /**
   * Creates a short-lived single-use access token bound to:
   * - patron, loan, rendition, purpose, and expiry.
   */
  async createAccessToken(
    patronId: string,
    renditionId: string,
    dto: CreateRenditionAccessTokenDto,
  ) {
    const rendition = await this.renditions.findById(renditionId);
    if (!rendition) {
      throw new NotFoundException('Rendition not found');
    }

    const loan = await this.loans.findActiveForPatronAndRendition(
      patronId,
      renditionId,
    );
    if (!loan) {
      throw new ForbiddenException(
        'Patron does not have an active loan for this rendition',
      );
    }

    if (loan.status !== 'ACTIVE') {
      throw new ForbiddenException('Loan does not permit access');
    }

    const ttlSeconds = dto.ttlSeconds ?? 300;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // 256 bits of cryptographically secure randomness.
    const rawToken = randomBytes(32).toString('base64url');

    // Only the hash is stored — never the raw token.
    const tokenHash = this.hashToken(rawToken);

    const token = this.accessTokenRepository.create({
      tokenHash,
      patronId,
      loanId: loan.id,
      renditionId: rendition.id,
      purpose: dto.purpose,
      expiresAt,
      usedAt: null,
    });

    await this.accessTokenRepository.save(token);

    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      purpose: dto.purpose,
      // Application URL only — this is NOT a storage bucket URL.
      accessUrl: `/api/digital-renditions/${rendition.id}/content?token=${encodeURIComponent(rawToken)}`,
    };
  }

  /**
   * Validates and consumes a token.
   * Every authorization property is re-checked here so that revoking
   * a loan immediately invalidates previously issued tokens.
   */
  async consumeAccessToken(
    rawToken: string,
    requestedRenditionId: string,
    requiredPurpose: RenditionAccessPurpose = 'read',
  ) {
    if (!rawToken) {
      throw new UnauthorizedException('Access token is required');
    }

    const tokenHash = this.hashToken(rawToken);
    const token = await this.accessTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!token) {
      throw new NotFoundException('Access token not found');
    }

    // Prevent token reuse against a different rendition.
    if (token.renditionId !== requestedRenditionId) {
      throw new ForbiddenException(
        'Access token is not valid for this rendition',
      );
    }

    // Prevent purpose escalation.
    if (token.purpose !== requiredPurpose) {
      throw new ForbiddenException('Access token purpose is invalid');
    }

    // Single-use check.
    if (token.usedAt) {
      throw new ConflictException('Access token has already been used');
    }

    // Expiration check.
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Access token has expired');
    }

    // Re-check the loan at consumption time.
    const loan = await this.loans.findForPatron(token.loanId, token.patronId);
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    if (loan.patronId !== token.patronId) {
      throw new ForbiddenException('Loan does not belong to token patron');
    }

    if (loan.renditionId !== token.renditionId) {
      throw new ForbiddenException('Loan does not belong to token rendition');
    }

    if (
      loan.status === 'RETURNED' ||
      loan.status === 'REVOKED' ||
      loan.status === 'EXPIRED'
    ) {
      throw new ForbiddenException('Loan no longer permits access');
    }

    // Atomic single-use protection — only one concurrent request can win.
    const result = await this.accessTokenRepository
      .createQueryBuilder()
      .update(RenditionAccessToken)
      .set({ usedAt: new Date() })
      .where('id = :id', { id: token.id })
      .andWhere('usedAt IS NULL')
      .execute();

    if (result.affected !== 1) {
      throw new ConflictException('Access token has already been used');
    }

    return this.storage.getContent(token.renditionId);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
