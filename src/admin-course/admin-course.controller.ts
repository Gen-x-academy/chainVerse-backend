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
import { AdminCourseService } from './admin-course.service';
import { ReviewCourseDto } from './dto/review-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCourseController {
  constructor(private readonly adminCourseService: AdminCourseService) {}

  @Get('courses')
  findAll() {
    return this.adminCourseService.findAll();
  }

  @Get('course/:id')
  findOne(@Param('id') id: string) {
    return this.adminCourseService.findOne(id);
  }

  @Post('course/review/:id')
  review(@Param('id') id: string, @Body() dto: ReviewCourseDto) {
    return this.adminCourseService.review(id, dto);
  }

  @Patch('course/publish/:id')
  publish(@Param('id') id: string) {
    return this.adminCourseService.publish(id);
  }

  @Patch('course/unpublish/:id')
  unpublish(@Param('id') id: string) {
    return this.adminCourseService.unpublish(id);
  }

  @Patch('course/update/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.adminCourseService.update(id, dto);
  }

  @Delete('course/:id')
  delete(@Param('id') id: string) {
    return this.adminCourseService.delete(id);
  }

  @Get('course/enrollments/:id')
  getEnrollments(@Param('id') id: string) {
    return this.adminCourseService.getEnrollments(id);
  }
}
