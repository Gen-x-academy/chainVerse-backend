const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app'); // Make sure your app.js exports the Express app
const User = require('../models/User');
const Session = require('../models/Session');
const jwt = require('jsonwebtoken');

let studentToken, tutorToken, studentId, tutorId;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_TEST_URI);

  const student = await User.create({
    email: 'student@test.com',
    password: 'pass123',
    role: 'student',
  });
  const tutor = await User.create({
    email: 'tutor@test.com',
    password: 'pass123',
    role: 'tutor',
  });

  studentId = student._id;
  tutorId = tutor._id;

  studentToken = jwt.sign(
    { _id: student._id, role: 'student' },
    process.env.JWT_SECRET,
  );
  tutorToken = jwt.sign(
    { _id: tutor._id, role: 'tutor' },
    process.env.JWT_SECRET,
  );
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Session Booking API', () => {
  it('should allow a student to book a session', async () => {
    const res = await request(app)
      .post('/sessions/book')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        topic: 'Algebra Help',
        date: new Date(Date.now() + 86400000), // tomorrow
        tutorId: tutorId,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.session.topic).toBe('Algebra Help');
  });

  it('should return student sessions', async () => {
    const res = await request(app)
      .get('/sessions/student')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should allow a tutor to accept a session', async () => {
    const session = await Session.findOne({ tutor: tutorId });
    const res = await request(app)
      .put(`/sessions/${session._id}/accept`)
      .set('Authorization', `Bearer ${tutorToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.session.status).toBe('confirmed');
  });
});
