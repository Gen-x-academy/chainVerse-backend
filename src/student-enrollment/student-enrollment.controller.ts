import { Controller, Post, Get, Patch, Param, Req, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { StudentEnrollmentService } from './student-enrollment.service';
import { UpdateProgressDto } from './dto/update-progress.dto';

@ApiTags('Student Enrollment')
@ApiBearerAuth('access-token')
@Controller('student/enrollment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class StudentEnrollmentController {
  constructor(private readonly service: StudentEnrollmentService) {}

  @ApiOperation({ summary: 'Enroll in a free course' })
  @Post('free/:courseId')
  enrollFree(
    @Req() req: { user: { id: string } },
    @Param('courseId') courseId: string,
  ) {
    return this.service.enrollFree(req.user.id, courseId);
  }

  @ApiOperation({ summary: 'Checkout and enroll in all courses in cart' })
  @Post('checkout')
  checkout(@Req() req: { user: { id: string } }) {
    return this.service.checkoutCart(req.user.id);
  }

  @ApiOperation({ summary: 'Get list of enrolled courses' })
  @Get('my-courses')
  getMyCourses(@Req() req: { user: { id: string } }) {
    return this.service.getMyCourses(req.user.id);
  }

  @ApiOperation({ summary: 'Check if student is enrolled in a course' })
  @Get('is-enrolled/:courseId')
  async isEnrolled(
    @Req() req: { user: { id: string } },
    @Param('courseId') courseId: string,
  ) {
    const enrolled = await this.service.isEnrolled(req.user.id, courseId);
    return { isEnrolled: enrolled };
  }

  @ApiOperation({ summary: 'Update lesson progress for an enrolled course' })
  @Patch(':courseId/progress')
  updateProgress(
    @Req() req: { user: { id: string } },
    @Param('courseId') courseId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.service.updateProgress(
      req.user.id,
      courseId,
      dto.lessonIndex,
      dto.completed,
    );
  }
}
