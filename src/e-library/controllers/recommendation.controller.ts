import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RecommendationService } from '../services/recommendation.service';
import { RecommendationsQueryDto } from '../dto/recommendations-query.dto';

@ApiTags('E-Library Discovery')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller([
  'library/catalog/recommendations',
  'v1/library/catalog/recommendations',
])
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get()
  @ApiOperation({ summary: 'Get personalized book recommendations' })
  @ApiResponse({ status: 200, description: 'Personalized recommendations' })
  getRecommendations(
    @CurrentUser('sub') patronId: string,
    @Query() query: RecommendationsQueryDto,
  ) {
    return this.recommendationService.getRecommendations(
      patronId,
      query.limit,
      query.excludeUnavailable,
    );
  }
}
