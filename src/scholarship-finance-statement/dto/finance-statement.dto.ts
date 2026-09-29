import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatementExportStatus } from '../schemas/finance-statement.schema';

// ── Request DTOs ──────────────────────────────────────────────────────────────

export class GenerateStatementDto {
  @ApiProperty({ description: 'Organization (sponsor tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({ description: 'Restrict to a single program (omit for all programs)' })
  @IsOptional()
  @IsMongoId()
  programId?: string;

  @ApiProperty({ description: 'Inclusive period start (ISO 8601 date-time or date)' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ description: 'Inclusive period end (ISO 8601 date-time or date)' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({
    description:
      'ISO 4217 currency code. Required when the organisation has multi-currency ledgers. ' +
      'When omitted the service uses the dominant currency for the period.',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;
}

export class StatementListQueryDto {
  @ApiProperty({ description: 'Organization (sponsor tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;

  @ApiPropertyOptional({
    enum: StatementExportStatus,
    description: 'Filter by statement status',
  })
  @IsOptional()
  @IsIn(Object.values(StatementExportStatus))
  status?: StatementExportStatus;

  @ApiPropertyOptional({ description: 'Filter to a specific program ObjectId' })
  @IsOptional()
  @IsMongoId()
  programId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class StatementOrgQueryDto {
  @ApiProperty({ description: 'Organization (sponsor tenant) ObjectId' })
  @IsMongoId()
  organizationId: string;
}

// ── Response shapes ───────────────────────────────────────────────────────────

/**
 * A single line item in the rendered statement.
 *
 * Credit/debit amounts are in minor currency units.
 * Clients should divide by the currency's minor-unit factor (e.g. 100 for USD)
 * before display.
 */
export class StatementLineItemResponseDto {
  @ApiProperty() occurredAt: Date;
  @ApiProperty() eventType: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() sourceId: string;
  @ApiProperty() sourceType: string;
  @ApiProperty({ description: 'Credit amount in minor units' }) creditMinor: number;
  @ApiProperty({ description: 'Debit amount in minor units' }) debitMinor: number;
  @ApiProperty({ description: 'Running balance in minor units after this line' }) runningBalanceMinor: number;
  @ApiProperty() currency: string;
}

/**
 * Finance statement summary shown in the list view.
 *
 * Contains totals and status; `lineItems` are not included to keep list
 * payloads small.  Retrieve the full statement with GET /:id.
 */
export class StatementSummaryDto {
  @ApiProperty() statementId: string;
  @ApiProperty() organizationId: string;
  @ApiPropertyOptional() programId?: string;
  @ApiProperty() periodStart: Date;
  @ApiProperty() periodEnd: Date;
  @ApiProperty({ enum: StatementExportStatus }) status: StatementExportStatus;
  @ApiProperty() currency: string;
  @ApiProperty() openingBalanceMinor: number;
  @ApiProperty() closingBalanceMinor: number;
  @ApiProperty() totalCreditsMinor: number;
  @ApiProperty() totalDebitsMinor: number;
  @ApiProperty({ description: 'True when balances reconcile to ledger entries' }) reconciled: boolean;
  @ApiPropertyOptional() reconciliationNote?: string;
  @ApiProperty() requestedBy: string;
  @ApiPropertyOptional() completedAt?: Date;
  @ApiPropertyOptional() expiresAt?: Date;
  @ApiProperty() createdAt: Date;
}

/**
 * Full statement response including ordered line items.
 *
 * Returned by GET /:id when status = READY.  When status is PENDING or RUNNING
 * only the summary fields are populated and `lineItems` is empty.
 */
export class FinanceStatementResponseDto extends StatementSummaryDto {
  @ApiProperty({ type: [StatementLineItemResponseDto] })
  lineItems: StatementLineItemResponseDto[];
}
