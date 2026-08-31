import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PopularityRankingService } from '../services/popularity-ranking.service';
import { PopularBooksQueryDto } from '../dto/popular-books-query.dto';

@ApiTags('E-Library Discovery')
@Public()
@Controller(['library/catalog/popular', 'v1/library/catalog/popular'])
export class PopularityRankingController {
  constructor(private readonly popularityService: PopularityRankingService) {}

  @Get()
  @ApiOperation({ summary: 'Get popular and trending books' })
  @ApiResponse({ status: 200, description: 'Popular books ranked by circulation' })
  getPopular(@Query() query: PopularBooksQueryDto) {
    return this.popularityService.getPopularBooks(
      query.window,
      query.limit,
      query.format,
    );
  }
}
