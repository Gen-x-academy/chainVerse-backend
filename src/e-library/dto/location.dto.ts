import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LocationType } from '../schemas/library-location.schema';

export class CreateLocationDto {
  @ApiProperty({ enum: LocationType, description: 'Type of location' })
  @IsEnum(LocationType)
  @IsNotEmpty()
  type: LocationType;

  @ApiProperty({ description: 'Name of the location' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Parent location ID for hierarchy' })
  @IsMongoId()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsString()
  @IsOptional()
  sortOrder?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ description: 'New name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Active state' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsString()
  @IsOptional()
  sortOrder?: string;
}
