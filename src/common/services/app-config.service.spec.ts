import { AppConfigService } from './app-config.service';

describe('AppConfigService', () => {
  const build = (values: Record<string, unknown>) =>
    new AppConfigService({
      get: jest.fn((key: string) => values[key]),
    } as any);

  it('falls back to defaults when nothing is configured', () => {
    const service = build({});

    expect(service.port).toBe(3000);
    expect(service.nodeEnv).toBe('development');
    expect(service.isProduction).toBe(false);
    expect(service.allowedOrigins).toEqual(['http://localhost:3000']);
  });

  it('reads configured values', () => {
    const service = build({
      PORT: 4000,
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://a.test, https://b.test ',
    });

    expect(service.port).toBe(4000);
    expect(service.nodeEnv).toBe('production');
    expect(service.isProduction).toBe(true);
    expect(service.allowedOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => build({}).databaseUrl).toThrow('DATABASE_URL is not set');
  });

  it('returns the database URL when set', () => {
    const service = build({ DATABASE_URL: 'mongodb://localhost:27017/test' });

    expect(service.databaseUrl).toBe('mongodb://localhost:27017/test');
  });

  it('throws when JWT secrets are missing', () => {
    const service = build({});

    expect(() => service.jwtSecret).toThrow('JWT_SECRET is not set');
    expect(() => service.jwtRefreshSecret).toThrow(
      'JWT_REFRESH_SECRET is not set',
    );
  });

  it('returns JWT secrets when set', () => {
    const service = build({
      JWT_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
    });

    expect(service.jwtSecret).toBe('access-secret');
    expect(service.jwtRefreshSecret).toBe('refresh-secret');
  });
});
