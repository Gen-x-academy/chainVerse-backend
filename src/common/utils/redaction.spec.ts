import { redact } from './redaction';

describe('Redaction', () => {
  it('should redact sensitive keys', () => {
    const obj = {
      password: 'super-secret-password',
      user: {
        name: 'test-user',
        email: 'test-user@example.com',
      },
    };

    const redactedObj = redact(obj);
    expect(redactedObj).toEqual({
      password: '[REDACTED]',
      user: {
        name: 'test-user',
        email: 'test-user@example.com',
      },
    });
  });

  it('should redact nested sensitive keys', () => {
    const obj = {
      user: {
        name: 'test-user',
        credentials: {
          token: 'super-secret-token',
        },
      },
    };

    const redactedObj = redact(obj);
    expect(redactedObj).toEqual({
      user: {
        name: 'test-user',
        credentials: {
          token: '[REDACTED]',
        },
      },
    });
  });

  it('should redact sensitive keys in an array', () => {
    const obj = {
      users: [
        {
          name: 'test-user-1',
          password: 'password-1',
        },
        {
          name: 'test-user-2',
          password: 'password-2',
        },
      ],
    };

    const redactedObj = redact(obj);
    expect(redactedObj).toEqual({
      users: [
        {
          name: 'test-user-1',
          password: '[REDACTED]',
        },
        {
          name: 'test-user-2',
          password: '[REDACTED]',
        },
      ],
    });
  });

  it('should not redact non-sensitive keys', () => {
    const obj = {
      user: {
        name: 'test-user',
        email: 'test-user@example.com',
      },
    };

    const redactedObj = redact(obj);
    expect(redactedObj).toEqual(obj);
  });
});
