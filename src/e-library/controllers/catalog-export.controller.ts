import { Controller, Get, Header, Query, UseGuards, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CatalogExportService } from '../services/catalog-export.service';
import { ExportCatalogQueryDto, ExportFormat } from '../dto/export-catalog-query.dto';

@ApiTags('E-Library Catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/catalog/export', 'v1/library/catalog/export'])
export class CatalogExportController {
  constructor(private readonly catalogExportService: CatalogExportService) {}

  @Get()
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Export catalog data as CSV or JSON' })
  @Header('Content-Type', 'text/csv')
  async exportCatalog(
    @Query() query: ExportCatalogQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.catalogExportService.exportCatalog(query);

    if (query.format === ExportFormat.JSON) {
      res.setHeader('Content-Type', 'application/json');
      res.json(result);
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="catalog-export.csv"');
    res.send(result);
  }
}
