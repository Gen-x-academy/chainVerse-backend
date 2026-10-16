// ============================================================
// FILE: src/digital-renditions/entities/rendition-access-token.entity.ts
// ============================================================

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rendition_access_tokens')
@Index(['tokenHash'], { unique: true })
@Index(['loanId'])
@Index(['patronId'])
@Index(['renditionId'])
@Index(['expiresAt'])
export class RenditionAccessToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'uuid' })
  patronId!: string;

  @Column({ type: 'uuid' })
  loanId!: string;

  @Column({ type: 'uuid' })
  renditionId!: string;

  @Column({ type: 'varchar', length: 32 })
  purpose!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}


// ============================================================
// FILE: src/digital-renditions/dto/create-rendition-access-token.dto.ts
// ============================================================

import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export const RENDITION_ACCESS_PURPOSES = [
  'read',
  'download',
] as const;

export type RenditionAccessPurpose =
  (typeof RENDITION_ACCESS_PURPOSES)[number];

export class CreateRenditionAccessTokenDto {
  @IsIn(RENDITION_ACCESS_PURPOSES)
  purpose!: RenditionAccessPurpose;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  ttlSeconds?: number;
}


// ============================================================
// FILE: src/digital-renditions/dto/rendition-access-token-response.dto.ts
// ============================================================

import { ApiProperty } from '@nestjs/swagger';

export class RenditionAccessTokenResponseDto {
  @ApiProperty({
    description:
      'Opaque single-use bearer token. Never persisted in plaintext.',
  })
  token!: string;

  @ApiProperty({
    format: 'date-time',
  })
  expiresAt!: string;

  @ApiProperty({
    enum: ['read', 'download'],
  })
  purpose!: string;

  @ApiProperty({
    example:
      '/api/digital-renditions/6e5c.../content?token=...',
  })
  accessUrl!: string;
}


// ============================================================
// FILE: src/digital-renditions/digital-renditions.storage.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Readable } from 'node:stream';

export interface DigitalRenditionContent {
  stream: Readable;
  contentType: string;
  contentLength?: number;
  filename: string;
}

export interface DigitalRenditionStorage {
  getContent(
    renditionId: string,
  ): Promise<DigitalRenditionContent>;
}

/**
 * Storage adapter.
 *
 * Replace the implementation of getContent() with the project's
 * existing S3/GCS/Azure/local storage implementation.
 *
 * The controller must NEVER receive a public storage URL.
 */
@Injectable()
export class DigitalRenditionStorageService
  implements DigitalRenditionStorage
{
  async getContent(
    renditionId: string,
  ): Promise<DigitalRenditionContent> {
    /*
     * Example implementation:
     *
     * const rendition =
     *   await this.renditionRepository.findById(renditionId);
     *
     * const object = await this.s3.getObject({
     *   Bucket: rendition.bucket,
     *   Key: rendition.storageKey,
     * });
     *
     * return {
     *   stream: object.Body as Readable,
     *   contentType: rendition.contentType,
     *   contentLength: rendition.size,
     *   filename: rendition.filename,
     * };
     */

    throw new NotFoundException(
      'Rendition content not found',
    );
  }
}


// ============================================================
// FILE: src/digital-renditions/digital-renditions.service.ts
// ============================================================

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  Repository,
} from 'typeorm';

import {
  CreateRenditionAccessTokenDto,
  RenditionAccessPurpose,
} from './dto/create-rendition-access-token.dto';

import {
  RenditionAccessToken,
} from './entities/rendition-access-token.entity';

import {
  DigitalRenditionStorageService,
} from './digital-renditions.storage';

export type LoanStatus =
  | 'ACTIVE'
  | 'RETURNED'
  | 'REVOKED'
  | 'EXPIRED';

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
 * Adapter interfaces.
 *
 * Replace these with the actual repositories/services
 * from the migrated NestJS application.
 */
export interface LoanRepository {
  findActiveForPatronAndRendition(
    patronId: string,
    renditionId: string,
  ): Promise<PatronLoan | null>;

  findForPatron(
    loanId: string,
    patronId: string,
  ): Promise<PatronLoan | null>;
}

export interface RenditionRepository {
  findById(
    id: string,
  ): Promise<Rendition | null>;
}

@Injectable()
export class DigitalRenditionsService {
  constructor(
    @InjectRepository(RenditionAccessToken)
    private readonly accessTokenRepository:
      Repository<RenditionAccessToken>,

    private readonly storage:
      DigitalRenditionStorageService,

    private readonly loans:
      LoanRepository,

    private readonly renditions:
      RenditionRepository,
  ) {}

  /**
   * Creates a short-lived access token.
   *
   * Token is bound to:
   * - patron
   * - loan
   * - rendition
   * - purpose
   * - expiry
   */
  async createAccessToken(
    patronId: string,
    renditionId: string,
    dto: CreateRenditionAccessTokenDto,
  ) {
    const rendition =
      await this.renditions.findById(
        renditionId,
      );

    if (!rendition) {
      throw new NotFoundException(
        'Rendition not found',
      );
    }

    const loan =
      await this.loans.findActiveForPatronAndRendition(
        patronId,
        renditionId,
      );

    if (!loan) {
      throw new ForbiddenException(
        'Patron does not have an active loan for this rendition',
      );
    }

    if (loan.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Loan does not permit access',
      );
    }

    const ttlSeconds =
      dto.ttlSeconds ?? 300;

    const expiresAt = new Date(
      Date.now() +
        ttlSeconds * 1000,
    );

    /*
     * 256 bits of cryptographically secure
     * randomness.
     */
    const rawToken =
      randomBytes(32).toString(
        'base64url',
      );

    /*
     * Only the hash is stored.
     */
    const tokenHash =
      this.hashToken(rawToken);

    const token =
      this.accessTokenRepository.create({
        tokenHash,
        patronId,
        loanId: loan.id,
        renditionId: rendition.id,
        purpose: dto.purpose,
        expiresAt,
        usedAt: null,
      });

    await this.accessTokenRepository.save(
      token,
    );

    return {
      token: rawToken,

      expiresAt:
        expiresAt.toISOString(),

      purpose: dto.purpose,

      /*
       * Application URL only.
       *
       * This is NOT a bucket URL.
       */
      accessUrl:
        `/api/digital-renditions/${rendition.id}/content?token=${encodeURIComponent(rawToken)}`,
    };
  }

  /**
   * Validates and consumes a token.
   *
   * Every authorization property is checked again here.
   */
  async consumeAccessToken(
    rawToken: string,
    requestedRenditionId: string,
    requiredPurpose:
      RenditionAccessPurpose = 'read',
  ) {
    if (!rawToken) {
      throw new UnauthorizedException(
        'Access token is required',
      );
    }

    const tokenHash =
      this.hashToken(rawToken);

    const token =
      await this.accessTokenRepository.findOne({
        where: {
          tokenHash,
        },
      });

    if (!token) {
      throw new NotFoundException(
        'Access token not found',
      );
    }

    /*
     * Prevent token reuse against another
     * rendition.
     */
    if (
      token.renditionId !==
      requestedRenditionId
    ) {
      throw new ForbiddenException(
        'Access token is not valid for this rendition',
      );
    }

    /*
     * Prevent purpose escalation.
     */
    if (
      token.purpose !==
      requiredPurpose
    ) {
      throw new ForbiddenException(
        'Access token purpose is invalid',
      );
    }

    /*
     * Single-use check.
     */
    if (token.usedAt) {
      throw new ConflictException(
        'Access token has already been used',
      );
    }

    /*
     * Expiration check.
     */
    if (
      token.expiresAt.getTime() <=
      Date.now()
    ) {
      throw new UnauthorizedException(
        'Access token has expired',
      );
    }

    /*
     * Re-check the loan at consumption time.
     *
     * This means returning/revoking a loan
     * immediately invalidates previously issued
     * access tokens.
     */
    const loan =
      await this.loans.findForPatron(
        token.loanId,
        token.patronId,
      );

    if (!loan) {
      throw new NotFoundException(
        'Loan not found',
      );
    }

    if (
      loan.patronId !==
      token.patronId
    ) {
      throw new ForbiddenException(
        'Loan does not belong to token patron',
      );
    }

    if (
      loan.renditionId !==
      token.renditionId
    ) {
      throw new ForbiddenException(
        'Loan does not belong to token rendition',
      );
    }

    /*
     * Returned/revoked/expired loans cannot
     * consume previously issued tokens.
     */
    if (
      loan.status === 'RETURNED' ||
      loan.status === 'REVOKED' ||
      loan.status === 'EXPIRED'
    ) {
      throw new ForbiddenException(
        'Loan no longer permits access',
      );
    }

    /*
     * Atomic single-use protection.
     *
     * If two requests arrive simultaneously,
     * only one can change usedAt from NULL.
     */
    const result =
      await this.accessTokenRepository
        .createQueryBuilder()
        .update(RenditionAccessToken)
        .set({
          usedAt: new Date(),
        })
        .where(
          'id = :id',
          { id: token.id },
        )
        .andWhere(
          'usedAt IS NULL',
        )
        .execute();

    if (result.affected !== 1) {
      throw new ConflictException(
        'Access token has already been used',
      );
    }

    /*
     * Resolve the rendition internally and
     * stream it through the API.
     */
    return this.storage.getContent(
      token.renditionId,
    );
  }

  private hashToken(
    token: string,
  ): string {
    return createHash('sha256')
      .update(token, 'utf8')
      .digest('hex');
  }
}


// ============================================================
// FILE: src/digital-renditions/digital-renditions.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type {
  Request,
  Response,
} from 'express';

import {
  CreateRenditionAccessTokenDto,
} from './dto/create-rendition-access-token.dto';

import {
  RenditionAccessTokenResponseDto,
} from './dto/rendition-access-token-response.dto';

import {
  DigitalRenditionsService,
} from './digital-renditions.service';

interface AuthenticatedRequest
  extends Request {
  user: {
    id: string;
  };
}

@ApiTags('Digital Renditions')
@ApiBearerAuth()
@Controller('digital-renditions')
export class DigitalRenditionsController {
  constructor(
    private readonly service:
      DigitalRenditionsService,
  ) {}

  /**
   * Issue a temporary access token.
   */
  @Post(':renditionId/access-token')
  @ApiOperation({
    summary:
      'Issue temporary access token',
    description:
      'Creates a short-lived single-use token bound to the authenticated patron, active loan, rendition, purpose, and expiry.',
  })
  @ApiParam({
    name: 'renditionId',
    type: String,
    format: 'uuid',
  })
  @ApiResponse({
    status: 201,
    description:
      'Access token created.',
    type:
      RenditionAccessTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Authentication required.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Patron does not have an active loan.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Rendition not found.',
  })
  async createAccessToken(
    @Req()
    req: AuthenticatedRequest,

    @Param('renditionId')
    renditionId: string,

    @Query()
    dto: CreateRenditionAccessTokenDto,
  ) {
    return this.service.createAccessToken(
      req.user.id,
      renditionId,
      dto,
    );
  }

  /**
   * Consume the access token and stream
   * the digital rendition.
   */
  @Get(':renditionId/content')
  @ApiOperation({
    summary:
      'Access digital rendition',
    description:
      'Consumes a short-lived single-use application access token and streams the rendition through the API. Storage URLs are never exposed.',
  })
  @ApiParam({
    name: 'renditionId',
    type: String,
    format: 'uuid',
  })
  @ApiQuery({
    name: 'token',
    type: String,
    required: true,
  })
  @ApiProduces(
    'application/octet-stream',
  )
  @ApiResponse({
    status: 200,
    description:
      'Digital rendition content.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing or expired token.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Authorization failed.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Token, loan, or rendition not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Token has already been consumed.',
  })
  async getContent(
    @Param('renditionId')
    renditionId: string,

    @Query('token')
    token: string,

    @Res()
    res: Response,
  ) {
    const content =
      await this.service.consumeAccessToken(
        token,
        renditionId,
        'read',
      );

    res.setHeader(
      'Content-Type',
      content.contentType,
    );

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${this.sanitizeFilename(content.filename)}"`,
    );

    if (
      content.contentLength !==
      undefined
    ) {
      res.setHeader(
        'Content-Length',
        content.contentLength,
      );
    }

    /*
     * Do not allow browser/proxy caching
     * of borrowed content.
     */
    res.setHeader(
      'Cache-Control',
      'private, no-store',
    );

    res.setHeader(
      'Pragma',
      'no-cache',
    );

    content.stream.pipe(res);
  }

  private sanitizeFilename(
    filename: string,
  ): string {
    return filename
      .replace(/[\r\n"]/g, '')
      .replace(/[\\/]/g, '_')
      .slice(0, 255);
  }
}


// ============================================================
// FILE: src/digital-renditions/digital-renditions.module.ts
// ============================================================

import {
  Module,
} from '@nestjs/common';

import {
  TypeOrmModule,
} from '@nestjs/typeorm';

import {
  DigitalRenditionsController,
} from './digital-renditions.controller';

import {
  DigitalRenditionsService,
} from './digital-renditions.service';

import {
  DigitalRenditionStorageService,
} from './digital-renditions.storage';

import {
  RenditionAccessToken,
} from './entities/rendition-access-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RenditionAccessToken,
    ]),
  ],

  controllers: [
    DigitalRenditionsController,
  ],

  providers: [
    DigitalRenditionsService,
    DigitalRenditionStorageService,

    /*
     * Add the project's existing loan and
     * rendition repository adapters here.
     */
  ],

  exports: [
    DigitalRenditionsService,
  ],
})
export class DigitalRenditionsModule {}


// ============================================================
// FILE: src/database/migrations/1727190000000-create-rendition-access-tokens.ts
// ============================================================

import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

export class CreateRenditionAccessTokens1727190000000
  implements MigrationInterface
{
  name =
    'CreateRenditionAccessTokens1727190000000';

  async up(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rendition_access_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash" varchar(64) NOT NULL,
        "patronId" uuid NOT NULL,
        "loanId" uuid NOT NULL,
        "renditionId" uuid NOT NULL,
        "purpose" varchar(32) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "usedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT "PK_rendition_access_tokens"
          PRIMARY KEY ("id"),

        CONSTRAINT "UQ_rendition_access_tokens_token_hash"
          UNIQUE ("tokenHash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_loan"
      ON "rendition_access_tokens" ("loanId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_patron"
      ON "rendition_access_tokens" ("patronId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_rendition"
      ON "rendition_access_tokens" ("renditionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_expiry"
      ON "rendition_access_tokens" ("expiresAt")
    `);
  }

  async down(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_rendition_access_tokens_expiry"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_rendition_access_tokens_rendition"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_rendition_access_tokens_patron"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_rendition_access_tokens_loan"
    `);

    await queryRunner.query(`
      DROP TABLE "rendition_access_tokens"
    `);
  }
}


// ============================================================
// FILE: src/digital-renditions/tests/digital-renditions.service.spec.ts
// ============================================================

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  DigitalRenditionsService,
} from '../digital-renditions.service';

describe(
  'DigitalRenditionsService',
  () => {
    let service:
      DigitalRenditionsService;

    const accessTokenRepository =
      {
        create: jest.fn(),
        save: jest.fn(),
        findOne: jest.fn(),
        createQueryBuilder:
          jest.fn(),
      };

    const storage = {
      getContent: jest.fn(),
    };

    const loans = {
      findActiveForPatronAndRendition:
        jest.fn(),

      findForPatron:
        jest.fn(),
    };

    const renditions = {
      findById: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();

      service =
        new DigitalRenditionsService(
          accessTokenRepository as any,
          storage as any,
          loans as any,
          renditions as any,
        );
    });

    describe(
      'createAccessToken',
      () => {
        it(
          'rejects missing rendition',
          async () => {
            renditions.findById
              .mockResolvedValue(
                null,
              );

            await expect(
              service.createAccessToken(
                'patron-1',
                'rendition-1',
                {
                  purpose: 'read',
                },
              ),
            ).rejects.toBeInstanceOf(
              NotFoundException,
            );
          },
        );

        it(
          'rejects patron without active loan',
          async () => {
            renditions.findById
              .mockResolvedValue({
                id: 'rendition-1',
              });

            loans
              .findActiveForPatronAndRendition
              .mockResolvedValue(null);

            await expect(
              service.createAccessToken(
                'patron-1',
                'rendition-1',
                {
                  purpose: 'read',
                },
              ),
            ).rejects.toBeInstanceOf(
              ForbiddenException,
            );
          },
        );

        it(
          'creates a bound access token',
          async () => {
            renditions.findById
              .mockResolvedValue({
                id: 'rendition-1',
                filename:
                  'book.pdf',
                contentType:
                  'application/pdf',
              });

            loans
              .findActiveForPatronAndRendition
              .mockResolvedValue({
                id: 'loan-1',
                patronId:
                  'patron-1',
                renditionId:
                  'rendition-1',
                status: 'ACTIVE',
              });

            accessTokenRepository
              .create
              .mockImplementation(
                (value: any) =>
                  value,
              );

            accessTokenRepository
              .save
              .mockImplementation(
                async (
                  value: any,
                ) => value,
              );

            const result =
              await service.createAccessToken(
                'patron-1',
                'rendition-1',
                {
                  purpose: 'read',
                },
              );

            expect(
              result.token,
            ).toBeDefined();

            expect(
              result.expiresAt,
            ).toBeDefined();

            expect(
              result.accessUrl,
            ).toContain(
              '/api/digital-renditions/rendition-1/content',
            );

            expect(
              accessTokenRepository
                .create,
            ).toHaveBeenCalledWith(
              expect.objectContaining(
                {
                  patronId:
                    'patron-1',

                  loanId:
                    'loan-1',

                  renditionId:
                    'rendition-1',

                  purpose:
                    'read',

                  usedAt:
                    null,
                },
              ),
            );
          },
        );
      },
    );

    describe(
      'consumeAccessToken',
      () => {
        const baseToken =
          {
            id: 'token-1',

            tokenHash:
              'hash',

            patronId:
              'patron-1',

            loanId:
              'loan-1',

            renditionId:
              'rendition-1',

            purpose:
              'read',

            expiresAt:
              new Date(
                Date.now() +
                  60_000,
              ),

            usedAt:
              null,
          };

        function setupValidToken() {
          accessTokenRepository
            .findOne
            .mockResolvedValue(
              baseToken,
            );

          loans.findForPatron
            .mockResolvedValue({
              id: 'loan-1',

              patronId:
                'patron-1',

              renditionId:
                'rendition-1',

              status: 'ACTIVE',
            });

          const update = {
            set: jest.fn()
              .mockReturnThis(),

            where: jest.fn()
              .mockReturnThis(),

            andWhere: jest.fn()
              .mockReturnThis(),

            execute: jest.fn()
              .mockResolvedValue({
                affected: 1,
              }),
          };

          accessTokenRepository
            .createQueryBuilder
            .mockReturnValue(
              update,
            );

          storage.getContent
            .mockResolvedValue({
              stream: {},

              contentType:
                'application/pdf',

              filename:
                'book.pdf',
            });
        }

        it(
          'rejects unknown token',
          async () => {
            accessTokenRepository
              .findOne
              .mockResolvedValue(
                null,
              );

            await expect(
              service.consumeAccessToken(
                'invalid',
                'rendition-1',
              ),
            ).rejects.toBeInstanceOf(
              NotFoundException,
            );
          },
        );

        it(
          'rejects token for another rendition',
          async () => {
            setupValidToken();

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-2',
              ),
            ).rejects.toBeInstanceOf(
              ForbiddenException,
            );

            expect(
              storage.getContent,
            ).not.toHaveBeenCalled();
          },
        );

        it(
          'rejects expired token',
          async () => {
            setupValidToken();

            baseToken.expiresAt =
              new Date(
                Date.now() -
                  1000,
              );

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-1',
              ),
            ).rejects.toBeInstanceOf(
              UnauthorizedException,
            );
          },
        );

        it(
          'rejects returned loan',
          async () => {
            setupValidToken();

            loans.findForPatron
              .mockResolvedValue({
                id: 'loan-1',

                patronId:
                  'patron-1',

                renditionId:
                  'rendition-1',

                status:
                  'RETURNED',
              });

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-1',
              ),
            ).rejects.toBeInstanceOf(
              ForbiddenException,
            );

            expect(
              storage.getContent,
            ).not.toHaveBeenCalled();
          },
        );

        it(
          'rejects revoked loan',
          async () => {
            setupValidToken();

            loans.findForPatron
              .mockResolvedValue({
                id: 'loan-1',

                patronId:
                  'patron-1',

                renditionId:
                  'rendition-1',

                status:
                  'REVOKED',
              });

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-1',
              ),
            ).rejects.toBeInstanceOf(
              ForbiddenException,
            );
          },
        );

        it(
          'rejects already-used token',
          async () => {
            setupValidToken();

            baseToken.usedAt =
              new Date();

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-1',
              ),
            ).rejects.toBeInstanceOf(
              ConflictException,
            );
          },
        );

        it(
          'rejects incorrect purpose',
          async () => {
            setupValidToken();

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-1',
                'download',
              ),
            ).rejects.toBeInstanceOf(
              ForbiddenException,
            );
          },
        );

        it(
          'consumes a valid token',
          async () => {
            setupValidToken();

            await service
              .consumeAccessToken(
                'token',
                'rendition-1',
              );

            expect(
              accessTokenRepository
                .createQueryBuilder,
            ).toHaveBeenCalled();

            expect(
              storage.getContent,
            ).toHaveBeenCalledWith(
              'rendition-1',
            );
          },
        );

        it(
          'rejects concurrent token replay',
          async () => {
            setupValidToken();

            const update = {
              set: jest.fn()
                .mockReturnThis(),

              where: jest.fn()
                .mockReturnThis(),

              andWhere: jest.fn()
                .mockReturnThis(),

              execute: jest.fn()
                .mockResolvedValue({
                  affected: 0,
                }),
            };

            accessTokenRepository
              .createQueryBuilder
              .mockReturnValue(
                update,
              );

            await expect(
              service.consumeAccessToken(
                'token',
                'rendition-1',
              ),
            ).rejects.toBeInstanceOf(
              ConflictException,
            );

            expect(
              storage.getContent,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );
  },
);


// ============================================================
// FILE: OPERATIONS.md
// ============================================================

# Digital Rendition Access

Digital rendition files are never exposed through permanent
public storage URLs.

Clients request a short-lived access token:

POST /api/digital-renditions/:renditionId/access-token

The token is bound to:

- patron
- loan
- rendition
- purpose
- expiry

Tokens are single-use.

The API streams the rendition through the application rather
than returning an S3/GCS/Azure/public storage URL.

Returning or revoking a loan invalidates previously issued
tokens because the loan is revalidated when the token is
consumed.

## Security

- Store only token hashes.
- Never log raw access tokens.
- Keep token TTL short.
- Do not expose bucket names or object keys.
- Do not return permanent storage URLs.
- Set rendition responses to `Cache-Control: private, no-store`.
- Rate-limit token issuance and content access.
- Monitor repeated 401, 403, and 409 responses.
- Periodically clean up expired and consumed tokens.

## Token lifecycle

1. Patron authenticates.
2. Patron requests an access token.
3. API verifies an active loan.
4. API generates a cryptographically random token.
5. API stores only its SHA-256 hash.
6. API returns the token once.
7. Client requests the rendition using the token.
8. API validates token binding and expiry.
9. API re-checks the loan.
10. API atomically consumes the token.
11. API streams the rendition.
12. The token cannot be reused.
