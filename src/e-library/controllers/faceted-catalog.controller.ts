import { Controller, Get, HttpCode, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { FacetedCatalogService } from '../services/faceted-catalog.service';
import { FacetedSearchDto, AvailabilityFilter } from '../dto/faceted-search.dto';

@ApiTags('E-Library Discovery')
@Controller(['library/catalog/browse', 'v1/library/catalog/browse'])
export class FacetedCatalogController {
  constructor(private readonly facetedService: FacetedCatalogService) {}

  @Get()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Browse catalog with faceted filters for format, topic, language, and availability' })
  @ApiQuery({ name: 'q', required: false, description: 'Free-text search query' })
  @ApiQuery({ name: 'format', required: false, description: 'Comma-separated format values', example: 'physical,ebook' })
  @ApiQuery({ name: 'topic', required: false, description: 'Comma-separated topic values', example: 'science,technology' })
  @ApiQuery({ name: 'language', required: false, description: 'Comma-separated language values', example: 'en,es' })
  @ApiQuery({ name: 'availability', required: false, enum: AvailabilityFilter, default: AvailabilityFilter.AVAILABLE })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', default: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (max 50)', default: 20 })
  @ApiResponse({ status: 200, description: 'Filtered results with facet counts' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  browse(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: FacetedSearchDto,
  ) {
    return this.facetedService.searchWithFacets(dto);
  }
}
