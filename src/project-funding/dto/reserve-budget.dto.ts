import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsString, Matches, Min } from 'class-validator';

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class ReserveBudgetDto {
  @ApiProperty({ example: 'reserve-req-01J9Z8Q7' })
  @IsString()
  @Matches(ID_PATTERN)
  requestId: string;

  @ApiProperty({ example: 'tenant-alpha' })
  @IsString()
  @Matches(ID_PATTERN)
  tenantId: string;

  @ApiProperty({ example: 'project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  projectId: string;

  @ApiProperty({ example: 'plan-project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  planId: string;

  @ApiProperty({ example: 'pool-project-1' })
  @IsString()
  @Matches(ID_PATTERN)
  poolId: string;

  @ApiProperty({ example: 250000, minimum: 1 })
  @IsInt()
  @Min(1)
  amountMinor: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiProperty({ example: 1, minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty({ example: '2027-01-01T00:00:00.000Z' })
  @IsISO8601()
  expiresAt: string;
}
