import { Controller, Get, HttpCode, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { NewArrivalsService } from '../services/new-arrivals.service';
import { NewArrivalsQueryDto } from '../dto/new-arrivals-query.dto';
import { BookFormat } from '../schemas/book.schema';

@ApiTags('E-Library Discovery')
@Controller(['library/catalog/new-arrivals', 'v1/library/catalog/new-arrivals'])
export class NewArrivalsController {
  constructor(private readonly newArrivalsService: NewArrivalsService) {}

  @Get()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'New arrivals and recently added collections' })
  @ApiQuery({ name: 'days', required: false, description: 'Look-back window in days (max 365)', default: 30 })
  @ApiQuery({ name: 'format', required: false, enum: BookFormat, description: 'Filter by format' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', default: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (max 50)', default: 20 })
  @ApiResponse({ status: 200, description: 'Newly available books' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  getNewArrivals(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: NewArrivalsQueryDto,
  ) {
    return this.newArrivalsService.getNewArrivals(dto);
  }
}
