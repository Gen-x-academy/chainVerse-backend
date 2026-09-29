import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBase64,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Shareable, URL-backed filters for the finance operations dashboard (#1174).
 *
 * Two equivalent ways to express a filter set:
 *
 *  1. **Individual parameters** (`asset`, `status`, `from`, `to`, `limit`) —
 *     what a client builds a query from.
 *  2. **`view`** — a base64-encoded JSON object of the same fields. This is what
 *     makes a dashboard *shareable*: a link carries its own filter state, so
 *     the recipient sees exactly what the sender saw, with no hidden defaults.
 *
 * When `view` is present it is decoded and validated, and any individual
 * parameters are ignored. A malformed `view` is a 400, not a silently ignored
 * parameter — a link that does not decode should fail loudly rather than
 * render a different dashboard.
 */
export class FinanceDashboardQueryDto {
  @ApiPropertyOptional({
    description:
      'Base64-encoded JSON of the filter set. Overrides the individual ' +
      'parameters when present, so a shared link reproduces an exact view.',
    example: 'eyJhc3NldCI6IlhBTCIsInN0YXR1cyI6Im9wZW4ifQ==',
  })
  @IsOptional()
  @IsBase64()
  @MinLength(2)
  view?: string;

  @ApiPropertyOptional({ description: 'Asset code to scope the dashboard to' })
  @IsOptional()
  @IsString()
  asset?: string;

  @ApiPropertyOptional({
    description: 'Only show items whose status matches',
    example: 'open',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Only show items created on or after this date',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  from?: Date;

  @ApiPropertyOptional({
    description: 'Only show items created on or before this date',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  to?: Date;

  @ApiPropertyOptional({
    description: 'Maximum rows per section',
    default: 25,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 25;

  /**
   * Maximum age of a section before it is labelled stale, in milliseconds.
   * A finance dashboard that does not say how fresh its numbers are is worse
   * than no dashboard: an operator balancing against a figure from yesterday
   * will make a decision on money that has already moved.
   */
  @ApiPropertyOptional({
    description: 'Staleness threshold in milliseconds',
    default: 15 * 60 * 1000,
    minimum: 1_000,
  })
  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Type(() => Number)
  staleAfterMs?: number = 15 * 60 * 1000;
}

/** The filter fields a `view` may carry. */
export interface DashboardFilterSet {
  asset?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Decodes a `view` parameter.
 *
 * Separated from the DTO so it can be unit-tested without instantiating
 * class-validator, and so the failure mode is explicit: it returns `null` for
 * anything that is not a well-formed base64 JSON object, which the controller
 * turns into a 400.
 */
export function decodeDashboardView(view: string): DashboardFilterSet | null {
  try {
    const json = Buffer.from(view, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const filter = parsed as Record<string, unknown>;
    const out: DashboardFilterSet = {};
    for (const key of ['asset', 'status'] as const) {
      if (typeof filter[key] === 'string' && (filter[key] as string).length > 0) {
        out[key] = filter[key] as string;
      }
    }
    for (const key of ['from', 'to'] as const) {
      const value = filter[key];
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
        out[key] = value;
      }
    }
    if (typeof filter.limit === 'number' && Number.isFinite(filter.limit)) {
      out.limit = Math.min(Math.max(Math.trunc(filter.limit), 1), 100);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Encodes a filter set into a `view` value.
 *
 * Used by the dashboard to emit a self-describing link, so "share this view"
 * is a real feature rather than a instruction to copy the URL by hand.
 */
export function encodeDashboardView(filter: DashboardFilterSet): string {
  return Buffer.from(JSON.stringify(filter), 'utf8').toString('base64');
}

/**
 * A row in a dashboard section, plus the confirmation requirement that governs
 * what may be done to it.
 *
 * `requiresConfirmation` is never implied from the row's data: it is set by the
 * action that would mutate it, so a client cannot discover a high-risk route
 * by reading a GET response.
 */
export enum FinanceDashboardAction {
  APPROVE_REFUND = 'approve_refund',
  APPROVE_RECOVERY = 'approve_recovery',
  WRITE_OFF_RECOVERY = 'write_off_recovery',
  CREDIT_DEPOSIT = 'credit_deposit',
  RECORD_COLLECTION = 'record_collection',
}
