import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MentorshipDeliveryMode } from '../mentorship-program.schema';

export class MentorshipProgramLocationDto {
  @ApiProperty({ minLength: 2, maxLength: 2, description: 'ISO-3166 alpha-2 country code; never an address.' })
  @IsString()
  @Length(2, 2)
  countryCode: string;
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  region: string;
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  city: string;
  @ApiPropertyOptional({ maxLength: 120, description: 'Optional public venue label, not a precise address.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  venueLabel?: string;
}

export class ManageMentorshipProgramDto {
  @ApiProperty({ description: 'Organization scope for this program.' })
  @IsString()
  organizationId: string;
  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  name: string;
  @ApiProperty({ enum: MentorshipDeliveryMode })
  @IsEnum(MentorshipDeliveryMode)
  deliveryMode: MentorshipDeliveryMode;
  @ApiPropertyOptional({ maxLength: 80, description: 'Required for remote and hybrid.' })
  @ValidateIf((o: ManageMentorshipProgramDto) =>
    o.deliveryMode === MentorshipDeliveryMode.REMOTE ||
    o.deliveryMode === MentorshipDeliveryMode.HYBRID,
  )
  @IsString()
  @MaxLength(80)
  remotePlatform?: string;
  @ApiPropertyOptional({ maxLength: 1000, description: 'Required for remote and hybrid; do not put secrets here.' })
  @ValidateIf((o: ManageMentorshipProgramDto) =>
    o.deliveryMode === MentorshipDeliveryMode.REMOTE ||
    o.deliveryMode === MentorshipDeliveryMode.HYBRID,
  )
  @IsString()
  @MaxLength(1000)
  remoteJoinInstructions?: string;
  @ApiPropertyOptional({ type: MentorshipProgramLocationDto, description: 'Required for in-person and hybrid. Exact addresses/coordinates are rejected by policy.' })
  @ValidateIf((o: ManageMentorshipProgramDto) =>
    o.deliveryMode === MentorshipDeliveryMode.IN_PERSON ||
    o.deliveryMode === MentorshipDeliveryMode.HYBRID,
  )
  @ValidateNested()
  @Type(() => MentorshipProgramLocationDto)
  location?: MentorshipProgramLocationDto;
  @ApiProperty({ minLength: 8, maxLength: 64, description: 'Retry key scoped to the authenticated actor and program.' })
  @IsString()
  @Length(8, 64)
  idempotencyKey: string;
}
