import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export enum AutocompleteField {
  TITLE = 'title',
  AUTHOR = 'author',
  SUBJECT = 'subject',
  ISBN = 'isbn',
}

export class AutocompleteQueryDto {
  @ApiProperty({ description: 'Search prefix', example: 'mach', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({ description: 'Field to autocomplete', enum: AutocompleteField, default: AutocompleteField.TITLE })
  @IsOptional()
  @IsEnum(AutocompleteField)
  field?: AutocompleteField = AutocompleteField.TITLE;

  @ApiPropertyOptional({ description: 'Max suggestions', default: 10, maximum: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25)
  @Type(() => Number)
  limit?: number = 10;
}
