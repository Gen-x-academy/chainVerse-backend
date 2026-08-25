import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

/** Staff-initiated checkout — the minimal supporting op holds/renewals act on. */
export class CreateLoanDto {
  @ApiProperty({ description: 'Id of the book edition being checked out.' })
  @IsMongoId()
  bookId: string;

  @ApiProperty({ description: 'Id of the patron the loan is issued to.' })
  @IsString()
  @IsNotEmpty()
  patronId: string;
}
