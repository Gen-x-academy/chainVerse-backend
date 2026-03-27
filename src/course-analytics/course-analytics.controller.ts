import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CourseAnalyticsService } from './course-analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiBearerAuth('access-token')
@ApiTags('Course Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseAnalyticsController {
  constructor(private readonly analyticsService: CourseAnalyticsService) {}

  @Get('courses/:id')
  @ApiOperation({ summary: 'Get analytics for a specific course (tutor/admin only)' })
  @Roles(Role.TUTOR, Role.ADMIN)
  async getCourseAnalytics(
    @Param('id') courseId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const analytics = await this.analyticsService.getCourseAnalytics(courseId);
    
    // Tutors can only see their own courses
    if (role === Role.TUTOR && analytics.tutorId !== userId) {
      throw new Error('Unauthorized: You can only view analytics for your own courses');
    }
    
    return analytics;
  }

  @Get('tutor/:tutorId')
  @ApiOperation({ summary: 'Get analytics for a tutor (tutor can only view their own)' })
  @Roles(Role.TUTOR, Role.ADMIN)
  async getTutorAnalytics(
    @Param('tutorId') tutorId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // Tutors can only see their own analytics
    if (role === Role.TUTOR && tutorId !== userId) {
      throw new Error('Unauthorized: You can only view your own analytics');
    }
    
    return this.analyticsService.getTutorAnalytics(tutorId);
  }

  @Get('platform')
  @ApiOperation({ summary: 'Get platform-wide analytics (admin only)' })
  @Roles(Role.ADMIN)
  async getPlatformAnalytics() {
    return this.analyticsService.getPlatformAnalytics();
  }
}
