import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
} from '@nestjs/common';
import { AdminCourseService } from './admin-course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ReviewCourseDto } from './dto/review-course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth('access-token')
@ApiTags('Admin Courses')
@Controller('admin/courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR)
export class AdminCourseController {
  constructor(private readonly adminCourseService: AdminCourseService) {}

  @Get()
  @ApiOperation({ summary: 'Get all courses with optional filters' })
  findAll(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    return this.adminCourseService.findAll({
      status,
      category,
      limit: limit ? parseInt(String(limit), 10) : undefined,
      skip: skip ? parseInt(String(skip), 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single course by ID' })
  findOne(@Param('id') id: string) {
    return this.adminCourseService.findOne(id);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Review a course (approve/reject)' })
  @Roles(Role.ADMIN)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewCourseDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminCourseService.review(id, dto, adminId);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish a course' })
  publish(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.adminCourseService.publish(id, adminId, true);
  }

  @Patch(':id/unpublish')
  @ApiOperation({ summary: 'Unpublish a course' })
  unpublish(@Param('id') id: string, @CurrentUser('sub') adminId: string) {
    return this.adminCourseService.unpublish(id, adminId, true);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a course (admin)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminCourseService.update(id, dto, adminId, true);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a course (admin)' })
  @Roles(Role.ADMIN)
  delete(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Query('reason') reason?: string,
  ) {
    return this.adminCourseService.delete(id, adminId, true, reason);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'Get course enrollments' })
  getEnrollments(@Param('id') id: string) {
    return this.adminCourseService.getEnrollments(id);
  }
}
