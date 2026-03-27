import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { StudentEnrollmentService } from './student-enrollment.service';

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
  isEnrolled(
    @Req() req: { user: { id: string } },
    @Param('courseId') courseId: string,
  ) {
    return this.service.isEnrolled(req.user.id, courseId);
  }
}
