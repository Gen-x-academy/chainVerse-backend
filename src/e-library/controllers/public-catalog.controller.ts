import { Controller, Get, HttpCode, Query, ValidationPipe } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BooksService } from '../books.service';
import { BookFormat } from '../schemas/book.schema';
import { AccessibilityFilterDto } from '../dto/update-accessibility.dto';

/**
 * Issue #1000 – Public paginated catalog browse endpoint.
 *
 * Intentionally unauthenticated so patrons can discover published material
 * without an account. Uses a deterministic cursor and stable sort so pages
 * do not drift. The returned shape excludes internal acquisition and
 * moderation fields.
 */
@ApiTags('E-Library Public Catalog')
@Controller(['library/public/catalog', 'v1/library/public/catalog'])
export class PublicCatalogController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Browse published catalog with cursor pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor from the previous response' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-50)', example: 20 })
  @ApiQuery({ name: 'format', required: false, enum: BookFormat })
  @ApiQuery({ name: 'largePrint', required: false, type: Boolean })
  @ApiQuery({ name: 'dyslexiaFriendly', required: false, type: Boolean })
  @ApiQuery({ name: 'screenReaderReady', required: false, type: Boolean })
  @ApiQuery({ name: 'captioned', required: false, type: Boolean })
  @ApiQuery({ name: 'transcript', required: false, type: Boolean })
  @ApiQuery({ name: 'audiobook', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Paginated catalog page' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters (e.g. stale cursor)' })
  browse(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('format') format?: BookFormat,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    accessibility?: AccessibilityFilterDto,
  ) {
    return this.booksService.browse(
      cursor,
      limit ?? 20,
      format,
      accessibility,
    );
  }
}
