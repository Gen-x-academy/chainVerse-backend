import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { StudentSavedCoursesService } from './student-saved-courses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@ApiTags('Student Saved Courses')
@ApiBearerAuth('access-token')
@Controller('student/saved-courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class StudentSavedCoursesController {
  constructor(private readonly service: StudentSavedCoursesService) {}

  @Post(':id/add')
  @ApiOperation({ summary: 'Save a course to the authenticated student\'s list' })
  add(@Req() req: { user: { id: string } }, @Param('id', new ParseObjectIdPipe()) courseId: string) {
    return this.service.add(req.user.id, courseId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all saved courses for the authenticated student' })
  list(@Req() req: { user: { id: string } }) {
    return this.service.list(req.user.id);
  }

  @Delete(':courseId')
  @ApiOperation({ summary: 'Remove a course from the authenticated student\'s saved list' })
  remove(
    @Req() req: { user: { id: string } },
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
  ) {
    return this.service.remove(req.user.id, courseId);
  }
}
