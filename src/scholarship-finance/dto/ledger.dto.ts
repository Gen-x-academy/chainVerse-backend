import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { LedgerSourceType } from '../domain/finance.enums';
import { PaginationQueryDto } from './common.dto';

export class ListJournalsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LedgerSourceType })
  @IsOptional()
  @IsEnum(LedgerSourceType)
  sourceType?: LedgerSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 128)
  sourceId?: string;

  @ApiPropertyOptional({
    example: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  assetKey?: string;
}

export class ListAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'refund' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 128)
  entityId?: string;
}
