import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResolveOverrideDto {
  @IsNotEmpty()
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
