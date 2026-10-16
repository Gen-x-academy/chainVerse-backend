import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { BooksService } from '../books.service';
import {
  CatalogMappingService,
  CatalogFormat,
} from '../services/catalog-mapping.service';

class ExportCatalogBody {
  bookIds: string[];
  format: CatalogFormat;
}

class ImportCatalogBody {
  records: Record<string, unknown>[];
  format: CatalogFormat;
  dryRun?: boolean;
}

class ValidateCatalogBody {
  records: Record<string, unknown>[];
  format: CatalogFormat;
}

@ApiTags('E-Library Catalog Interoperability')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['e-library/catalog', 'v1/e-library/catalog'])
export class CatalogMappingController {
  constructor(
    private readonly mappingService: CatalogMappingService,
    private readonly booksService: BooksService,
  ) {}

  @Get('formats')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR, Role.STUDENT)
  @ApiOperation({ summary: 'List all supported catalog mapping formats' })
  @ApiResponse({ status: 200, description: 'Supported formats returned' })
  listFormats() {
    return this.mappingService.listSupportedFormats();
  }

  @Get('formats/:format/version')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR, Role.STUDENT)
  @ApiOperation({ summary: 'Get mapping version info for a specific format' })
  @ApiParam({
    name: 'format',
    enum: CatalogFormat,
    description: 'Catalog format identifier',
  })
  @ApiResponse({ status: 200, description: 'Version info returned' })
  @ApiResponse({ status: 404, description: 'Format not found' })
  getVersion(@Param('format') format: CatalogFormat) {
    return this.mappingService.getMappingVersion(format);
  }

  @Post('export')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Export books to a specified catalog format' })
  @ApiBody({ type: ExportCatalogBody })
  @ApiResponse({ status: 200, description: 'Mapped records returned' })
  @ApiResponse({ status: 404, description: 'One or more books not found' })
  async exportBooks(@Body() body: ExportCatalogBody) {
    const books = await Promise.all(
      body.bookIds.map((id) => this.booksService.findByIdOrThrow(id)),
    );
    return this.mappingService.batchMapToFormat(books, body.format);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({
    summary: 'Import books from an external catalog format',
    description:
      'Set dryRun=true to validate and preview mappings without persisting.',
  })
  @ApiBody({ type: ImportCatalogBody })
  @ApiResponse({
    status: 200,
    description:
      'Import results - mapped DTOs and per-record validation',
  })
  @ApiResponse({ status: 400, description: 'Validation failures in one or more records' })
  async importBooks(@Body() body: ImportCatalogBody) {
    const result = await this.mappingService.batchMapFromFormat(
      body.records,
      body.format,
    );

    if (body.dryRun) {
      return {
        dryRun: true,
        mapped: result.mapped,
        validationResults: result.validationResults,
      };
    }

    const saved = [];
    for (const dto of result.mapped) {
      const book = await this.booksService.create(dto);
      saved.push(book);
    }

    return {
      dryRun: false,
      saved,
      validationResults: result.validationResults,
    };
  }

  @Post('validate')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN, Role.TUTOR, Role.STUDENT)
  @ApiOperation({
    summary: 'Validate mapping of external records without importing',
  })
  @ApiBody({ type: ValidateCatalogBody })
  @ApiResponse({
    status: 200,
    description: 'Per-record validation results',
  })
  async validateMapping(@Body() body: ValidateCatalogBody) {
    const validationResults = body.records.map((record) =>
      this.mappingService.validateMapping(record, body.format),
    );

    return {
      format: body.format,
      totalRecords: body.records.length,
      validCount: validationResults.filter((r) => r.valid).length,
      invalidCount: validationResults.filter((r) => !r.valid).length,
      validationResults,
    };
  }
}
