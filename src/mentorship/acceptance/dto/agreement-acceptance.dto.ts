import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AcceptanceIntent } from '../schemas/agreement-acceptance.schema';

/** Creates a new, immutable version of an agreement's terms. */
export class PublishAgreementTermsDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  agreementId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: [String], description: 'Actors allowed to accept this version' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  participantIds!: string[];

  @ApiProperty({ description: 'Private agreement body (stored only in the terms snapshot)' })
  @IsObject()
  terms!: Record<string, unknown>;

  @ApiProperty({ description: 'ISO-8601 instant from which the terms take effect' })
  @IsDateString()
  effectiveAt!: string;
}

/** Explicit, replay-resistant acceptance of a specific terms version. */
export class AcceptAgreementDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({
    description: 'SHA-256 commitment to the exact terms document that was reviewed',
    pattern: '^[a-fA-F0-9]{64}$',
  })
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  termsHash!: string;

  @ApiPropertyOptional({
    description: 'Map of term component name to its reviewed version number',
    type: Object,
  })
  @IsObject()
  termVersions!: Record<string, number>;

  @ApiProperty({
    description: 'One-time random nonce (16-128 url-safe characters)',
    minLength: 16,
    maxLength: 128,
  })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  nonce!: string;

  @ApiProperty({ enum: AcceptanceIntent })
  @IsIn([AcceptanceIntent.ACCEPT])
  intent!: AcceptanceIntent;
}
