import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CurriculumService } from './curriculum.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { ReorderCurriculumDto } from './dto/reorder-curriculum.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@ApiBearerAuth('access-token')
@ApiTags('Course Curriculum')
@Controller('courses/:courseId/curriculum')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TUTOR, Role.ADMIN, Role.MODERATOR)
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the full curriculum outline with its current version',
  })
  getCurriculum(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.getCurriculum(courseId, {
      id: userId,
      role,
    });
  }

  @Post('sections')
  @ApiOperation({ summary: 'Append a section to the curriculum' })
  addSection(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Body() dto: CreateSectionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.addSection(courseId, dto, {
      id: userId,
      role,
    });
  }

  @Patch('sections/:sectionId')
  @ApiOperation({ summary: 'Update section metadata (not its position)' })
  updateSection(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Param('sectionId', new ParseObjectIdPipe()) sectionId: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.updateSection(courseId, sectionId, dto, {
      id: userId,
      role,
    });
  }

  @Delete('sections/:sectionId')
  @ApiOperation({ summary: 'Delete a section and every lesson it holds' })
  removeSection(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Param('sectionId', new ParseObjectIdPipe()) sectionId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.removeSection(courseId, sectionId, {
      id: userId,
      role,
    });
  }

  @Post('sections/:sectionId/lessons')
  @ApiOperation({ summary: 'Append a lesson to a section' })
  addLesson(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Param('sectionId', new ParseObjectIdPipe()) sectionId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.addLesson(courseId, sectionId, dto, {
      id: userId,
      role,
    });
  }

  @Patch('lessons/:lessonId')
  @ApiOperation({ summary: 'Update lesson content (not its position)' })
  updateLesson(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Param('lessonId', new ParseObjectIdPipe()) lessonId: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.updateLesson(courseId, lessonId, dto, {
      id: userId,
      role,
    });
  }

  @Delete('lessons/:lessonId')
  @ApiOperation({ summary: 'Delete a lesson and close the position gap' })
  removeLesson(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Param('lessonId', new ParseObjectIdPipe()) lessonId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.removeLesson(courseId, lessonId, {
      id: userId,
      role,
    });
  }

  @Put('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reorder every section and lesson of the course in one atomic operation',
  })
  @ApiConflictResponse({
    description:
      'The curriculum changed since expectedVersion was read; reload and retry.',
  })
  reorder(
    @Param('courseId', new ParseObjectIdPipe()) courseId: string,
    @Body() dto: ReorderCurriculumDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.curriculumService.reorder(courseId, dto, {
      id: userId,
      role,
    });
  }
}
