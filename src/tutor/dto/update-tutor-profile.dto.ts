import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  Min,
  IsNumber,
} from 'class-validator';

export class UpdateTutorProfileDto {
  @ApiProperty({
    example: 'Experienced software engineer with 10+ years in blockchain.',
    required: false,
  })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty({ example: 'https://example.com/profile.jpg', required: false })
  @IsUrl()
  @IsOptional()
  profileImageUrl?: string;

  @ApiProperty({
    example: ['Blockchain', 'Smart Contracts', 'Web3'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  specializations?: string[];

  @ApiProperty({
    example: 'PhD in Computer Science, Certified Ethereum Developer',
    required: false,
  })
  @IsString()
  @IsOptional()
  qualifications?: string;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsOfExperience?: number;

  @ApiProperty({ example: 'https://linkedin.com/in/johndoe', required: false })
  @IsUrl()
  @IsOptional()
  linkedinUrl?: string;

  @ApiProperty({ example: 'https://johndoe.dev', required: false })
  @IsUrl()
  @IsOptional()
  websiteUrl?: string;
}
