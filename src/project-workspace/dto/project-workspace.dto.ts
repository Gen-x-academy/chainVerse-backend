import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NoteStatus } from '../schemas/project-note.schema';
import {
  ResourceAccessPolicy,
  ResourceKind,
} from '../schemas/project-resource.schema';
import {
  ObjectiveStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';

const SHA256 = /^[a-fA-F0-9]{64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{1,128}$/;

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Owning tenant (organization) id' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  tenantId!: string;

  @ApiProperty({ description: 'Stable workspace key, unique per tenant' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  key!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ pattern: IDEMPOTENCY.source })
  @IsOptional()
  @Matches(IDEMPOTENCY)
  idempotencyKey?: string;
}

export class ObjectiveDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ enum: ObjectiveStatus })
  @IsOptional()
  @IsEnum(ObjectiveStatus)
  status?: ObjectiveStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class MilestoneDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}

export class UpdateWorkspaceDto {
  @ApiProperty({ description: 'Version currently held by the caller' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ type: [ObjectiveDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ObjectiveDto)
  objectives?: ObjectiveDto[];

  @ApiPropertyOptional({ type: [MilestoneDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDto)
  milestones?: MilestoneDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  nextActions?: string[];
}

export class WorkspaceStatusDto {
  @ApiProperty({ enum: WorkspaceStatus })
  @IsEnum(WorkspaceStatus)
  status!: WorkspaceStatus;

  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AddMemberDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  userId!: string;

  @ApiProperty({ enum: WorkspaceRole })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class CreateNoteDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'Markdown source; rendered to safe HTML' })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  linkedNoteIds?: string[];

  @ApiPropertyOptional({ pattern: IDEMPOTENCY.source })
  @IsOptional()
  @Matches(IDEMPOTENCY)
  idempotencyKey?: string;
}

export class UpdateNoteDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content?: string;

  @ApiPropertyOptional({ enum: NoteStatus })
  @IsOptional()
  @IsEnum(NoteStatus)
  status?: NoteStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  linkedNoteIds?: string[];
}

export class NoteVersionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CreatePrivateNoteDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 20_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string;

  @ApiPropertyOptional({ pattern: IDEMPOTENCY.source })
  @IsOptional()
  @Matches(IDEMPOTENCY)
  idempotencyKey?: string;
}

export class UpdatePrivateNoteDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content?: string;
}

export class CreateResourceDto {
  @ApiProperty({ enum: ResourceKind })
  @IsEnum(ResourceKind)
  kind!: ResourceKind;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Storage key or https link' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  uri!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  sizeBytes?: number;

  @ApiProperty({
    description: 'SHA-256 of the approved bytes',
    pattern: SHA256.source,
  })
  @Matches(SHA256)
  checksumSha256!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  license?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  citations?: string[];

  @ApiPropertyOptional({ enum: ResourceAccessPolicy })
  @IsOptional()
  @IsEnum(ResourceAccessPolicy)
  accessPolicy?: ResourceAccessPolicy;

  @ApiPropertyOptional({ pattern: IDEMPOTENCY.source })
  @IsOptional()
  @Matches(IDEMPOTENCY)
  idempotencyKey?: string;
}

export class UpdateResourceDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_tld: false })
  uri?: string;

  @ApiPropertyOptional({ pattern: SHA256.source })
  @IsOptional()
  @Matches(SHA256)
  checksumSha256?: string;

  @ApiPropertyOptional({ enum: ResourceAccessPolicy })
  @IsOptional()
  @IsEnum(ResourceAccessPolicy)
  accessPolicy?: ResourceAccessPolicy;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  license?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  citations?: string[];
}

export class ReviewResourceDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
