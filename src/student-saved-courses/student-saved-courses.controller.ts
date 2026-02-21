import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { StudentSavedCoursesService } from './student-saved-courses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('student/save')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class StudentSavedCoursesController {
  constructor(private readonly service: StudentSavedCoursesService) {}

  @Post(':id/add')
  add(@Req() req: { user: { id: string } }, @Param('id') courseId: string) {
    return this.service.add(req.user.id, courseId);
  }

  @Get(':id')
  list(@Param('id') studentId: string) {
    return this.service.list(studentId);
  }

  @Delete(':id/:courseId')
  remove(@Param('id') studentId: string, @Param('courseId') courseId: string) {
    return this.service.remove(studentId, courseId);
  }
}
