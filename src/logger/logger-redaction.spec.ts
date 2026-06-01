import pino from 'pino';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.currentPassword',
  'req.body.token',
  'req.body.refreshToken',
];

function makeLogger(chunks: string[]) {
  return pino(
    {
      level: 'info',
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    },
    {
      write(chunk: string) {
        chunks.push(chunk);
      },
    } as any,
  );
}

describe('Pino log redaction', () => {
  let chunks: string[];

  beforeEach(() => {
    chunks = [];
  });

  it('redacts req.headers.authorization and replaces with [REDACTED]', () => {
    const logger = makeLogger(chunks);
    logger.info({
      req: {
        headers: { authorization: 'Bearer super-secret-token', host: 'localhost' },
        body: {},
      },
    });

    const log = JSON.parse(chunks[0]!);
    expect(log.req.headers.authorization).toBe('[REDACTED]');
    expect(log.req.headers.host).toBe('localhost');
  });

  it('redacts req.body.password and replaces with [REDACTED]', () => {
    const logger = makeLogger(chunks);
    logger.info({
      req: {
        headers: {},
        body: { email: 'user@example.com', password: 'my-secret-pass' },
      },
    });

    const log = JSON.parse(chunks[0]!);
    expect(log.req.body.password).toBe('[REDACTED]');
    expect(log.req.body.email).toBe('user@example.com');
  });

  it('does not redact unrelated fields', () => {
    const logger = makeLogger(chunks);
    logger.info({ req: { headers: { host: 'api.chainverse.io' }, body: { name: 'Alice' } } });

    const log = JSON.parse(chunks[0]!);
    expect(log.req.headers.host).toBe('api.chainverse.io');
    expect(log.req.body.name).toBe('Alice');
  });

  it('redacts req.headers.cookie', () => {
    const logger = makeLogger(chunks);
    logger.info({ req: { headers: { cookie: 'session=abc123' }, body: {} } });

    const log = JSON.parse(chunks[0]!);
    expect(log.req.headers.cookie).toBe('[REDACTED]');
  });

  it('redacts req.body.refreshToken', () => {
    const logger = makeLogger(chunks);
    logger.info({ req: { headers: {}, body: { refreshToken: 'tok.abc.xyz' } } });

    const log = JSON.parse(chunks[0]!);
    expect(log.req.body.refreshToken).toBe('[REDACTED]');
  });
});
