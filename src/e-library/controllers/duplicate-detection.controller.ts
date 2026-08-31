import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { DuplicateDetectionService } from '../services/duplicate-detection.service';
import { DuplicateDetectionQueryDto } from '../dto/duplicate-detection-query.dto';
import { MergeRecordsDto } from '../dto/merge-records.dto';

@ApiTags('E-Library Catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/catalog/duplicates', 'v1/library/catalog/duplicates'])
export class DuplicateDetectionController {
  constructor(private readonly duplicateDetectionService: DuplicateDetectionService) {}

  @Get()
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Detect duplicate catalog records' })
  detectDuplicates(@Query() query: DuplicateDetectionQueryDto) {
    return this.duplicateDetectionService.detectDuplicates(query);
  }

  @Post('merge')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Merge two duplicate records' })
  mergeRecords(@Body() dto: MergeRecordsDto) {
    return this.duplicateDetectionService.mergeRecords(dto);
  }
}
