import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CourseRatingsFeedbackService } from './course-ratings-feedback.service';
import { CreateCourseRatingsFeedbackDto } from './dto/create-course-ratings-feedback.dto';
import { UpdateCourseRatingsFeedbackDto } from './dto/update-course-ratings-feedback.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('courses')
export class CourseRatingsFeedbackController {
  constructor(private readonly service: CourseRatingsFeedbackService) {}

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  create(
    @Param('id') courseId: string,
    @Req() req: { user: { id: string } },
    @Body() payload: CreateCourseRatingsFeedbackDto,
  ) {
    return this.service.create(courseId, req.user.id, payload);
  }

  @Get(':id/ratings')
  findAllForCourse(@Param('id') courseId: string) {
    return this.service.findAllForCourse(courseId);
  }

  @Get(':id/my-rating')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  findMyRating(
    @Param('id') courseId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.findByStudentAndCourse(req.user.id, courseId);
  }

  @Put(':id/rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  update(
    @Param('id') courseId: string,
    @Req() req: { user: { id: string } },
    @Body() payload: UpdateCourseRatingsFeedbackDto,
  ) {
    return this.service.update(courseId, req.user.id, payload);
  }

  @Delete(':id/rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  remove(
    @Param('id') courseId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.remove(courseId, req.user.id);
  }
}
