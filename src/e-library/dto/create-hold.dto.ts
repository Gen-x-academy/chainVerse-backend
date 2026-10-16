import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CreateHoldDto {
  @ApiProperty({ description: 'Id of the book edition to place a hold on.' })
  @IsMongoId()
  bookId: string;
}
