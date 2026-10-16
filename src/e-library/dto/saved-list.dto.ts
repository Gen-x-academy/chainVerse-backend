import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSavedListDto {
  @ApiProperty({ description: 'Name of the list' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Whether this is a favorites list' })
  @IsBoolean()
  @IsOptional()
  isFavorite?: boolean;
}

export class AddItemToListDto {
  @ApiProperty({ description: 'ID of the book to add' })
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @ApiPropertyOptional({ description: 'Optional note about why this item was saved' })
  @IsString()
  @IsOptional()
  note?: string;
}
