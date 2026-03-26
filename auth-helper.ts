import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

export function generateToken(role: string) {
  return jwt.sign(
    {
      sub: 'test-user-id',
      role,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}
