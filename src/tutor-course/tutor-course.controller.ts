import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TutorCourseService } from './tutor-course.service';
import { CreateCourseDto } from '../admin-course/dto/create-course.dto';
import { UpdateCourseDto } from '../admin-course/dto/update-course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('access-token')
@ApiTags('Tutor Courses')
@Controller('tutor/courses')
@UseGuards(JwtAuthGuard)
export class TutorCourseController {
  constructor(private readonly tutorCourseService: TutorCourseService) {}

  @Get()
  @ApiOperation({ summary: 'Get all courses for the authenticated tutor' })
  findAll(@CurrentUser('sub') tutorId: string) {
    return this.tutorCourseService.findAll(tutorId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific course by ID (must be owned by tutor)',
  })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string, @CurrentUser('sub') tutorId: string) {
    return this.tutorCourseService.findOne(id, tutorId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new course' })
  create(
    @Body() dto: CreateCourseDto,
    @CurrentUser('sub') tutorId: string,
    @CurrentUser('email') tutorEmail: string,
    @CurrentUser('name') tutorName: string,
  ) {
    return this.tutorCourseService.create(dto, tutorId, tutorEmail, tutorName);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a course (must be owned by tutor)' })
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.tutorCourseService.update(id, dto, tutorId);
  }

  @Post(':id/submit-review')
  @ApiOperation({ summary: 'Submit a course for review' })
  submitForReview(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') tutorId: string,
  ) {
    return this.tutorCourseService.submitForReview(id, tutorId);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish an approved course' })
  publish(@Param('id', new ParseObjectIdPipe()) id: string, @CurrentUser('sub') tutorId: string) {
    return this.tutorCourseService.publish(id, tutorId);
  }

  @Patch(':id/unpublish')
  @ApiOperation({ summary: 'Unpublish a published course' })
  unpublish(@Param('id', new ParseObjectIdPipe()) id: string, @CurrentUser('sub') tutorId: string) {
    return this.tutorCourseService.unpublish(id, tutorId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a course (must be owned by tutor)' })
  delete(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @CurrentUser('sub') tutorId: string,
    @Query('reason') reason?: string,
  ) {
    return this.tutorCourseService.delete(id, tutorId, reason);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'Get enrollments for a course' })
  getEnrollments(@Param('id', new ParseObjectIdPipe()) id: string, @CurrentUser('sub') tutorId: string) {
    return this.tutorCourseService.getEnrollments(id, tutorId);
  }
}
