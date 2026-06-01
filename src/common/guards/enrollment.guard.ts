import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { StudentEnrollmentService } from '../../student-enrollment/student-enrollment.service';

/**
 * Rejects requests from students who are not enrolled in the requested course.
 * Expects:
 *   - req.user.id  — set by JwtAuthGuard
 *   - req.params.courseId — the course being accessed
 *
 * Apply after JwtAuthGuard so req.user is always populated.
 */
@Injectable()
export class EnrollmentGuard implements CanActivate {
  constructor(
    private readonly enrollmentService: StudentEnrollmentService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user: { id: string };
      params: { courseId?: string };
    }>();

    const courseId = req.params.courseId;
    if (!courseId) {
      throw new ForbiddenException('courseId route parameter is required');
    }

    const enrolled = await this.enrollmentService.isEnrolled(
      req.user.id,
      courseId,
    );
    if (!enrolled) {
      throw new ForbiddenException('Not enrolled in this course');
    }
    return true;
  }
}
