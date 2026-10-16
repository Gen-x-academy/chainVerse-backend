import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CatalogImportService } from '../services/catalog-import.service';
import { ImportCatalogDto } from '../dto/import-catalog.dto';

@ApiTags('E-Library Catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/catalog/import', 'v1/library/catalog/import'])
export class CatalogImportController {
  constructor(private readonly catalogImportService: CatalogImportService) {}

  @Post()
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Start a catalog import job' })
  startImport(
    @CurrentUser('sub') createdBy: string,
    @Body() dto: ImportCatalogDto,
  ) {
    return this.catalogImportService.startImport(dto, createdBy);
  }

  @Get(':jobId')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Get import job status' })
  @ApiParam({ name: 'jobId', description: 'Import job ID' })
  getStatus(@Param('jobId') jobId: string) {
    return this.catalogImportService.getImportStatus(jobId);
  }
}
