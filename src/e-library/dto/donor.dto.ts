import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDonorDto {
  @ApiProperty({ description: 'Donor name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Organization affiliation' })
  @IsString()
  @IsOptional()
  organization?: string;

  @ApiPropertyOptional({ description: 'Consent preferences' })
  @IsArray()
  @IsOptional()
  consentPreferences?: string[];

  @ApiPropertyOptional({ description: 'Name to use for public acknowledgment' })
  @IsString()
  @IsOptional()
  acknowledgmentName?: string;

  @ApiPropertyOptional({ description: 'Allow public acknowledgment' })
  @IsBoolean()
  @IsOptional()
  allowPublicAcknowledgment?: boolean;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateDonationDto {
  @ApiProperty({ description: 'Donor ID' })
  @IsString()
  @IsNotEmpty()
  donorId: string;

  @ApiPropertyOptional({ description: 'Book ID if linking to existing catalog entry' })
  @IsString()
  @IsOptional()
  bookId?: string;

  @ApiProperty({ description: 'List of donated titles' })
  @IsArray()
  @IsNotEmpty()
  titles: string[];

  @ApiPropertyOptional({ description: 'Quantity of items' })
  @IsString()
  @IsOptional()
  quantity?: string;

  @ApiPropertyOptional({ description: 'Valuation note' })
  @IsString()
  @IsOptional()
  valuationNote?: string;

  @ApiPropertyOptional({ description: 'Restrictions on use' })
  @IsString()
  @IsOptional()
  restrictions?: string;

  @ApiPropertyOptional({ description: 'Provenance notes' })
  @IsArray()
  @IsOptional()
  provenanceNotes?: string[];
}
