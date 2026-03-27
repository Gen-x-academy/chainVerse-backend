import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminCourseService } from '../admin-course/admin-course.service';
import { CreateCourseDto } from '../admin-course/dto/create-course.dto';
import { UpdateCourseDto } from '../admin-course/dto/update-course.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiBearerAuth('access-token')
@ApiTags('Tutor Courses')
@Controller('tutor/courses')
@UseGuards(JwtAuthGuard)
export class TutorCourseController {
  constructor(private readonly courseService: AdminCourseService) {}

  @Get()
  @ApiOperation({ summary: 'Get all courses for the authenticated tutor' })
  findAll(@CurrentUser('sub') tutorId: string) {
    return this.courseService.findByTutor(tutorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific course by ID (must be owned by tutor)' })
  findOne(@Param('id') id: string, @CurrentUser('sub') tutorId: string) {
    return this.courseService.findOne(id).then((course) => {
      if (course.tutorId !== tutorId) {
        throw new Error('Unauthorized');
      }
      return course;
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new course' })
  create(
    @Body() dto: CreateCourseDto,
    @CurrentUser('sub') tutorId: string,
    @CurrentUser('email') tutorEmail: string,
    @CurrentUser('name') tutorName: string,
  ) {
    return this.courseService.create(dto, tutorId, tutorEmail, tutorName);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a course (must be owned by tutor)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.courseService.update(id, dto, tutorId, false);
  }

  @Post(':id/submit-review')
  @ApiOperation({ summary: 'Submit a course for review' })
  submitForReview(
    @Param('id') id: string,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.courseService.submitForReview(id, tutorId);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish an approved course' })
  publish(
    @Param('id') id: string,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.courseService.publish(id, tutorId, false);
  }

  @Patch(':id/unpublish')
  @ApiOperation({ summary: 'Unpublish a published course' })
  unpublish(
    @Param('id') id: string,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.courseService.unpublish(id, tutorId, false);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a course (must be owned by tutor)' })
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') tutorId: string,
    @Query('reason') reason?: string,
  ) {
    return this.courseService.delete(id, tutorId, false, reason);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'Get enrollments for a course' })
  getEnrollments(
    @Param('id') id: string,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.courseService.findOne(id).then((course) => {
      if (course.tutorId !== tutorId) {
        throw new Error('Unauthorized');
      }
      return this.courseService.getEnrollments(id);
    });
  }
}
