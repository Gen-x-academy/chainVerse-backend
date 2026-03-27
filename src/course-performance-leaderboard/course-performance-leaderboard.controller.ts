import { ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
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
import { LEADERBOARD_CACHE_KEY } from './course-performance-leaderboard.service';
import { CreateCoursePerformanceLeaderboardDto } from './dto/create-course-performance-leaderboard.dto';
import { UpdateCoursePerformanceLeaderboardDto } from './dto/update-course-performance-leaderboard.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth('access-token')
@Controller('courses/performance-leaderboard')
export class CoursePerformanceLeaderboardController {
  constructor(private readonly service: CoursePerformanceLeaderboardService) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(LEADERBOARD_CACHE_KEY)
  @CacheTTL(300000)
  @ApiOperation({ summary: 'Get leaderboard (cached, 5 min TTL)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300000)
  @ApiOperation({ summary: 'Get single leaderboard entry (cached, 5 min TTL)' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateCoursePerformanceLeaderboardDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateCoursePerformanceLeaderboardDto,
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
