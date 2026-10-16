import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsMongoId,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderSectionDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  sectionId: string;

  @ApiProperty({
    type: [String],
    example: ['507f1f77bcf86cd799439012'],
    description:
      'Lessons of this section in their new order. May be empty, and may contain lessons currently held by another section of the same course.',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  lessonIds: string[];
}

export class ReorderCurriculumDto {
  @ApiProperty({
    example: 4,
    description:
      'curriculumVersion the client last read. A mismatch means someone else reordered in the meantime and the request is rejected with 409.',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiProperty({
    type: [ReorderSectionDto],
    description:
      'The complete outline in its new order. Every section and every lesson of the course must appear exactly once.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReorderSectionDto)
  sections: ReorderSectionDto[];
}
