import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The requesting student is taken from the JWT — there is deliberately no
 * `studentId` field, so a request can only ever be filed for the caller.
 */
export class CreateStudentCertificateNameChangeRequestDto {
  @ApiProperty({ example: 'Ada Lovlace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  currentName: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  requestedName: string;

  @ApiPropertyOptional({ example: 'Surname was misspelled at enrollment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
