import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ContactMessageCategory,
  ContactMessagePriority,
} from '../enums/contact-message.enums';

export class CreateContactMessageDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  requesterName: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @IsNotEmpty()
  requesterEmail: string;

  @ApiProperty({ example: 'Question about course enrollment' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'I would like to know more about...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ enum: ContactMessageCategory, default: ContactMessageCategory.GENERAL })
  @IsEnum(ContactMessageCategory)
  @IsOptional()
  category?: ContactMessageCategory;

  @ApiPropertyOptional({ enum: ContactMessagePriority, default: ContactMessagePriority.MEDIUM })
  @IsEnum(ContactMessagePriority)
  @IsOptional()
  priority?: ContactMessagePriority;
}
