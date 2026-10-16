import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateLibraryItemDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  author: string;

  @IsNotEmpty()
  @IsString()
  barcode: string;

  @IsInt()
  @Min(1)
  totalCopies: number;

  @IsOptional()
  @IsString()
  servicePoint?: string;
}
