import { ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { CourseCategorizationFilteringService } from './course-categorization-filtering.service';
import { COURSE_DISCOVERY_CACHE_KEY } from './course-categorization-filtering.service';
import { CreateCourseCategorizationFilteringDto } from './dto/create-course-categorization-filtering.dto';
import { UpdateCourseCategorizationFilteringDto } from './dto/update-course-categorization-filtering.dto';
import { SearchCourseDto } from './dto/search-course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth('access-token')
@Controller('courses/categorization-filtering')
export class CourseCategorizationFilteringController {
  constructor(private readonly service: CourseCategorizationFilteringService) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(COURSE_DISCOVERY_CACHE_KEY)
  @CacheTTL(300000)
  @ApiOperation({ summary: 'List all courses (cached, 5 min TTL)' })
  findAll() {
    return this.service.findAll();
  }

  /**
   * Full-text search with optional filters.
   *
   * Query parameters:
   *   query    – free-text keyword(s)
   *   category – filter by metadata.category
   *   level    – filter by metadata.level
   *   tags     – repeated param or comma-separated list for metadata.tags
   *
   * Results are ordered by descending relevance score.
   */
  @Get('search')
  @ApiOperation({
    summary: 'Full-text search and advanced course discovery',
    description:
      'Keyword search across title, description and metadata with optional ' +
      'category / level / tag filters. Results are relevance-ranked.',
  })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'level', required: false, type: String })
  @ApiQuery({ name: 'tags', required: false, type: [String] })
  search(@Query() dto: SearchCourseDto) {
    // Normalise tags: accept both repeated params and a single comma-separated value
    if (typeof dto.tags === 'string') {
      dto.tags = (dto.tags as string).split(',').map((t) => t.trim());
    }
    return this.service.search(dto);
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300000)
  @ApiOperation({ summary: 'Get single course entry (cached, 5 min TTL)' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateCourseCategorizationFilteringDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateCourseCategorizationFilteringDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
