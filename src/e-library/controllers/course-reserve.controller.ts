import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CourseReserveService } from '../services/course-reserve.service';
import { CreateCourseReserveDto } from '../dto/course-reserve.dto';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

/**
 * REST API for managing library course reserves.
 *
 * A course reserve places a physical copy or digital edition under a
 * shortened loan period for a specified course and date range, ensuring
 * high item turnover for enrolled students.
 *
 * Conflict rules:
 *  - Only one ACTIVE reserve per physical copy is permitted for any given
 *    date window.
 *  - Only one ACTIVE reserve per digital edition + course combination is
 *    permitted for any given date window.
 *
 * All endpoints require a valid JWT. See role annotations per endpoint.
 */
@ApiBearerAuth('access-token')
@ApiTags('E-Library Course Reserves')
@Controller('e-library/course-reserves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseReserveController {
  constructor(private readonly reserveService: CourseReserveService) {}

  /**
   * POST /e-library/course-reserves
   *
   * Create a new course reserve.
   *
   * Roles: LIBRARIAN, ADMIN
   */
  @Post()
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Create a course reserve',
    description:
      'Places a physical copy or digital edition on reserve for a course. ' +
      'startDate must be before endDate. Conflicting active reserves for the ' +
      'same resource and overlapping date range are rejected with 422.',
  })
  @ApiResponse({ status: 201, description: 'Reserve created successfully.' })
  @ApiResponse({
    status: 409,
    description: 'Conflicting active reserve exists for the same resource and date range.',
  })
  @ApiResponse({ status: 422, description: 'Date validation failed.' })
  create(
    @Body() dto: CreateCourseReserveDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reserveService.create(dto, req.user.id);
  }

  /**
   * GET /e-library/course-reserves/course/:courseId
   *
   * List all ACTIVE reserves for a course.
   *
   * Roles: LIBRARIAN, ADMIN, TUTOR, STUDENT
   */
  @Get('course/:courseId')
  @Roles(Role.LIBRARIAN, Role.ADMIN, Role.TUTOR, Role.STUDENT)
  @ApiOperation({
    summary: 'List active reserves for a course',
    description:
      'Returns all ACTIVE course reserves for the given courseId, ' +
      'sorted by startDate ascending.',
  })
  @ApiParam({ name: 'courseId', description: 'Course identifier' })
  @ApiResponse({ status: 200, description: 'List of active course reserves.' })
  findByCourse(@Param('courseId') courseId: string) {
    return this.reserveService.findByCourse(courseId);
  }

  /**
   * GET /e-library/course-reserves/:id
   *
   * Get a single reserve by ID.
   *
   * Roles: LIBRARIAN, ADMIN
   */
  @Get(':id')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Get a course reserve by ID',
    description: 'Returns the full reserve document. Returns 404 if not found.',
  })
  @ApiParam({ name: 'id', description: 'CourseReserve document ID' })
  @ApiResponse({ status: 200, description: 'Reserve document.' })
  @ApiResponse({ status: 404, description: 'Reserve not found.' })
  findOne(@Param('id') id: string) {
    return this.reserveService.findOne(id);
  }

  /**
   * PATCH /e-library/course-reserves/:id/cancel
   *
   * Cancel an active reserve.
   *
   * Roles: LIBRARIAN, ADMIN
   */
  @Patch(':id/cancel')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Cancel a course reserve',
    description:
      'Transitions an ACTIVE reserve to CANCELLED. ' +
      'Returns 422 if the reserve is already EXPIRED or CANCELLED.',
  })
  @ApiParam({ name: 'id', description: 'CourseReserve document ID' })
  @ApiResponse({ status: 200, description: 'Reserve cancelled.' })
  @ApiResponse({ status: 404, description: 'Reserve not found.' })
  @ApiResponse({
    status: 422,
    description: 'Reserve is not cancellable (already expired or cancelled).',
  })
  cancel(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.reserveService.cancel(id, req.user.id);
  }
}
