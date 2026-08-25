
import { IsString, IsNumber, IsObject } from 'class-validator';

export class CreateLearningEventDto {
  @IsString()
  eventId: string;

  @IsString()
  eventName: string;

  @IsNumber()
  schemaVersion: number;

  @IsObject()
  payload: Record<string, unknown>;
}