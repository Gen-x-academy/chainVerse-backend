import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { MentorshipProgramsController } from './mentorship-programs.controller';

describe('MentorshipProgramsController policy', () => {
  it('denies unauthenticated access by default', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MentorshipProgramsController)).toContain(JwtAuthGuard);
  });

  it('decorates cohort creation with idempotency protection', () => {
    const method = MentorshipProgramsController.prototype.createCohort;
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, method)).toContain(IdempotencyInterceptor);
  });
});
