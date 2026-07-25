import 'reflect-metadata';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { StudentAuthController } from './student-auth.controller';

describe('StudentAuthController forgot-password throttle', () => {
  it('limits forgot-password to 3 requests per 15 minutes', () => {
    const handler = StudentAuthController.prototype.forgetPassword;

    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', handler)).toBe(3);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', handler)).toBe(900_000);
  });
});
