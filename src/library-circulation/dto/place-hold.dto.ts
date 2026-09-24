import { IsNotEmpty, IsString } from 'class-validator';

export class PlaceHoldDto {
  @IsNotEmpty()
  @IsString()
  barcode: string;
}
