import request from 'supertest';
import { Server } from 'http';

export async function createUser(
  server: Server,
  email: string,
  password: string,
  role: string,
) {
  let endpoint;
  if (role === 'student') {
    endpoint = '/auth/student/register';
  } else if (role === 'tutor') {
    endpoint = '/tutor/register';
  } else {
    // For admin and moderator, we need to use a different endpoint
    // and we need to be authenticated as an admin.
    // We will handle this in a separate function.
    return;
  }

  await request(server).post(endpoint).send({
    firstName: 'Test',
    lastName: 'User',
    email,
    password,
  });
}

export async function createAdminUser(
  server: Server,
  email: string,
  password: string,
  role: string,
  adminAccessToken: string,
) {
  const endpoint = '/api/v1/organization-user/1/create'; // Assuming user ID 1 for simplicity
  await request(server)
    .post(endpoint)
    .set('Authorization', `Bearer ${adminAccessToken}`)
    .send({
      firstName: 'Test',
      lastName: 'User',
      email,
      password,
      role,
      status: 'ACTIVE',
    });
}

export async function loginUser(
  server: Server,
  email: string,
  password: string,
  role: string,
): Promise<string> {
  let endpoint;
  if (role === 'student') {
    endpoint = '/auth/student/login';
  } else if (role === 'tutor') {
    endpoint = '/tutor/login';
  } else {
    endpoint = '/api/v1/organization-user/login';
  }

  const res = await request(server).post(endpoint).send({ email, password });

  return res.body.accessToken;
}
