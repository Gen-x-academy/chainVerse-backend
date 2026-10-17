import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
} from '@nestjs/common';
import { CourseReportsAnalyticsService } from './course-reports-analytics.service';
import { CreateCourseReportsAnalyticsDto } from './dto/create-course-reports-analytics.dto';
import { UpdateCourseReportsAnalyticsDto } from './dto/update-course-reports-analytics.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Course Reports & Analytics')
@ApiBearerAuth('access-token')
@Controller('courses/reports-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseReportsAnalyticsController {
  constructor(private readonly service: CourseReportsAnalyticsService) {}

  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  @Get()
  @ApiOperation({ summary: 'List course report analytics records' })
  @ApiResponse({ status: 200, description: 'Records returned' })
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  @Get(':id')
  @ApiOperation({ summary: 'Get a course report analytics record by id' })
  @ApiResponse({ status: 200, description: 'Record returned' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  @ApiOperation({ summary: 'Create a course report analytics record' })
  @ApiResponse({ status: 201, description: 'Record created' })
  create(@Body() payload: CreateCourseReportsAnalyticsDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a course report analytics record' })
  @ApiResponse({ status: 200, description: 'Record updated' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateCourseReportsAnalyticsDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a course report analytics record' })
  @ApiResponse({ status: 200, description: 'Record deleted' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
