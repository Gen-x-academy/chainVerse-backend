import { ApiBearerAuth } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StudentReportsAnalyticsService } from './student-reports-analytics.service';
import { CreateStudentReportsAnalyticsDto } from './dto/create-student-reports-analytics.dto';
import { UpdateStudentReportsAnalyticsDto } from './dto/update-student-reports-analytics.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth('access-token')
@Controller('student-reports-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MODERATOR)
export class StudentReportsAnalyticsController {
  constructor(private readonly service: StudentReportsAnalyticsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() payload: CreateStudentReportsAnalyticsDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateStudentReportsAnalyticsDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
