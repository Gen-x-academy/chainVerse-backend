import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ConsentScope,
  RelationshipKind,
} from '../schemas/guardian-consent.schema';

const SCOPES = Object.values(ConsentScope);
const RELATIONSHIPS = Object.values(RelationshipKind);

export class EvaluateAgePolicyDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  minorId!: string;

  @ApiProperty({
    description: 'Participant date of birth (ISO-8601 date).',
    example: '2012-05-20',
  })
  @IsDateString()
  dateOfBirth!: string;

  @ApiPropertyOptional({
    description: 'Jurisdiction code used to pick the age-of-majority rule.',
    example: 'US',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  jurisdiction?: string;
}

export class InviteGuardianDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  minorId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  engagementId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  programId!: string;

  @ApiProperty({ description: 'Used only to evaluate the age policy.' })
  @IsDateString()
  dateOfBirth!: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  jurisdiction?: string;

  @ApiProperty({
    description: 'Guardian contact (email). Stored only as a one-way hash.',
    example: 'guardian@example.com',
  })
  @IsEmail()
  @MaxLength(320)
  guardianContact!: string;

  @ApiProperty({ enum: RelationshipKind })
  @IsIn(RELATIONSHIPS)
  relationship!: RelationshipKind;

  @ApiProperty({
    description: 'Opaque reference from the relationship-verification provider.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  verifiedRelationshipRef!: string;

  @ApiProperty({ enum: ConsentScope, type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SCOPES.length)
  @IsIn(SCOPES, { each: true })
  scopes!: ConsentScope[];

  @ApiProperty({ description: 'Terms version the consent is bound to.' })
  @IsInt()
  @Min(1)
  termsVersion!: number;

  @ApiProperty({ description: 'ISO-8601 timestamp when the invite expires.' })
  @IsDateString()
  expiresAt!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;
}

export class AcceptGuardianConsentDto {
  @ApiProperty({ description: 'One-time invite token returned by invite.' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  inviteToken!: string;

  @ApiProperty({ description: 'Must match the verified relationship reference.' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  verifiedRelationshipRef!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;
}

export class RevokeGuardianConsentDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  minorId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  engagementId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReConsentGuardianDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  minorId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  engagementId!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  programId!: string;

  @ApiProperty({
    description: 'New terms version that invalidates the prior consent.',
  })
  @IsInt()
  @Min(1)
  termsVersion!: number;

  @ApiProperty({ enum: ConsentScope, type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SCOPES.length)
  @IsIn(SCOPES, { each: true })
  scopes!: ConsentScope[];

  @ApiProperty({
    description: 'Guardian contact (email). Stored only as a one-way hash.',
  })
  @IsEmail()
  @MaxLength(320)
  guardianContact!: string;

  @ApiProperty({ enum: RelationshipKind })
  @IsIn(RELATIONSHIPS)
  relationship!: RelationshipKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  verifiedRelationshipRef!: string;

  @ApiProperty({ description: 'ISO-8601 timestamp when the invite expires.' })
  @IsDateString()
  expiresAt!: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  idempotencyKey!: string;
}
