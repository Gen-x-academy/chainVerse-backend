import { INestApplication, VersioningType } from '@nestjs/common';

/**
 * Enables URI-based API versioning on the NestJS application so that breaking
 * route changes can be introduced under a new version (e.g. /v2/...) without
 * forcing all clients to update simultaneously. Closes #404.
 *
 * Call this from main.ts before app.listen():
 *   enableApiVersioning(app);
 *
 * Controllers opt in with @Controller({ version: '1', path: 'users' })
 * which resolves to /api/v1/users when the global prefix is 'api'.
 */
export function enableApiVersioning(
  app: INestApplication,
  defaultVersion = '1',
): void {
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion,
    prefix: 'v',
  });
}
