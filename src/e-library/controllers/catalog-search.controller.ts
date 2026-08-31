import { Controller, Get, HttpCode, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogSearchService } from '../services/catalog-search.service';
import { CatalogSearchDto } from '../dto/catalog-search.dto';
import { BookFormat } from '../schemas/book.schema';

@ApiTags('E-Library Discovery')
@Controller(['library/catalog/search', 'v1/library/catalog/search'])
export class CatalogSearchController {
  constructor(private readonly searchService: CatalogSearchService) {}

  @Get()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Full-text search with weighted relevance' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (max 200 chars)', example: 'machine learning' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', default: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (max 50)', default: 20 })
  @ApiQuery({ name: 'format', required: false, enum: BookFormat, description: 'Filter by format' })
  @ApiResponse({ status: 200, description: 'Search results with weighted relevance' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  search(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CatalogSearchDto,
  ) {
    return this.searchService.search(dto);
  }
}
