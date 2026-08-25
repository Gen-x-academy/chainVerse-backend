import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LibraryCatalogService } from './library-catalog.service';
import { IsbnLookupDto } from './dto/isbn-lookup.dto';
import { UpdateBookDto } from './dto/update-book.dto';

@ApiTags('Library Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('library/catalog')
export class LibraryCatalogController {
  constructor(private readonly catalogService: LibraryCatalogService) {}

  /**
   * Issue #988 – ISBN lookup.
   * Returns a draft Book prefilled with metadata from an external provider.
   * The record requires librarian review before being published.
   */
  @Get('isbn-lookup')
  @ApiOperation({ summary: 'Look up book metadata by ISBN and prefill a draft record' })
  lookupByIsbn(@Query() dto: IsbnLookupDto) {
    return this.catalogService.lookupByIsbn(dto.isbn);
  }

  /**
   * Issue #986 – Update bibliographic metadata with optimistic concurrency.
   * Pass the current `revision` in the body; a stale value returns 409.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update book metadata (optimistic concurrency via revision field)' })
  updateMetadata(@Param('id') id: string, @Body() dto: UpdateBookDto) {
    return this.catalogService.updateMetadata(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single book by ID' })
  findOne(@Param('id') id: string) {
    return this.catalogService.findOne(id);
  }
}