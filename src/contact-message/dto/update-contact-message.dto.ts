import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ContactMessagePriority,
  ContactMessageStatus,
} from '../enums/contact-message.enums';

export class UpdateContactMessageDto {
  @ApiPropertyOptional({ enum: ContactMessageStatus })
  @IsEnum(ContactMessageStatus)
  @IsOptional()
  status?: ContactMessageStatus;

  @ApiPropertyOptional({ enum: ContactMessagePriority })
  @IsEnum(ContactMessagePriority)
  @IsOptional()
  priority?: ContactMessagePriority;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  @IsOptional()
  assigneeId?: string | null;

  @ApiPropertyOptional({ example: 'Assigned to support team' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  statusNote?: string;
}
