import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { MentorProfileController } from './mentor-profile.controller';

describe('MentorProfileController access control', () => {
  it('requires authentication on every route (deny by default)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MentorProfileController)).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, MentorProfileController)).toBeFalsy();
  });
});
