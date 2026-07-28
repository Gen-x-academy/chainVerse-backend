const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'confirmPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'clientSecret',
];

const SENSITIVE_KEYS_PATTERN = new RegExp(SENSITIVE_KEYS.join('|'), 'i');

export function redact(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redact);
  }

  const newObj: { [key: string]: any } = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (SENSITIVE_KEYS_PATTERN.test(key)) {
        newObj[key] = '[REDACTED]';
      } else {
        newObj[key] = redact((obj as any)[key]);
      }
    }
  }

  return newObj;
}
