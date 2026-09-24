import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CatalogCitationQueryDto,
  CitationFormat,
  ReadingListCitationQueryDto,
} from '../dto/citation-export-query.dto';
import { CitationExportService } from '../services/citation-export.service';

@ApiTags('E-Library Citations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/citations', 'v1/library/citations'])
export class CitationExportController {
  constructor(private readonly citationService: CitationExportService) {}

  @Get('catalog')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({
    summary: 'Export citations for catalog books (APA, MLA, Chicago, BibTeX, RIS)',
  })
  @ApiResponse({ status: 200, description: 'Citations rendered for the requested books' })
  @ApiResponse({ status: 404, description: 'One or more book ids do not exist' })
  exportCatalog(@Query() query: CatalogCitationQueryDto) {
    const ids = query.ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return this.citationService.exportCatalogCitations(ids, query.format);
  }

  @Get('reading-lists/:listId')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({
    summary: 'Export citations for every item in the caller-owned reading list',
  })
  @ApiParam({ name: 'listId', description: 'Saved reading list ObjectId' })
  @ApiQuery({
    name: 'format',
    enum: CitationFormat,
    description: 'Citation output style',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Citations rendered for the reading list items' })
  @ApiResponse({ status: 403, description: 'The list belongs to another patron' })
  @ApiResponse({ status: 404, description: 'Reading list not found' })
  exportReadingList(
    @Param('listId') listId: string,
    @CurrentUser('sub') ownerId: string,
    @Query() query: ReadingListCitationQueryDto,
  ) {
    return this.citationService.exportReadingListCitations(listId, ownerId, query.format);
  }
}