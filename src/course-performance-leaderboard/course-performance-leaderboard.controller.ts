import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { CoursePerformanceLeaderboardService } from './course-performance-leaderboard.service';
import { CreateCoursePerformanceLeaderboardDto } from './dto/create-course-performance-leaderboard.dto';
import { UpdateCoursePerformanceLeaderboardDto } from './dto/update-course-performance-leaderboard.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Course Performance Leaderboard')
@ApiBearerAuth('access-token')
@Controller('courses/performance-leaderboard')
export class CoursePerformanceLeaderboardController {
  constructor(private readonly service: CoursePerformanceLeaderboardService) {}

  @Public()
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey('leaderboard')
  @CacheTTL(300000)
  @ApiOperation({ summary: 'Get leaderboard (cached, 5 min TTL)' })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300000)
  @ApiOperation({ summary: 'Get single leaderboard entry (cached, 5 min TTL)' })
  @ApiResponse({ status: 200, description: 'Leaderboard entry found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a leaderboard entry' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateCoursePerformanceLeaderboardDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a leaderboard entry' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateCoursePerformanceLeaderboardDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a leaderboard entry' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
