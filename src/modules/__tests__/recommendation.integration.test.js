const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../app');
const Course = require('../../../models/course');
const Enrollment = require('../../../models/enrollment');
const ChallengeResult = require('../../../models/ChallengeResult');
const User = require('../../../models/user');
const jwt = require('jsonwebtoken');

describe('GET /api/recommendation/next-courses', () => {
  let token;
  let user;

  beforeAll(async () => {
    await mongoose.connect(global.__MONGO_URI__);

    user = await User.create({
      email: 'test@chainverse.io',
      password: 'Password123!',
    });

    token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it('returns recommended courses based on user history', async () => {
    const courseA = await Course.create({
      title: 'Intro to Web3',
      level: 'beginner',
      isPublished: true,
    });

    const courseB = await Course.create({
      title: 'Solidity Fundamentals',
      level: 'intermediate',
      prerequisite: courseA._id,
      isPublished: true,
    });

    await Enrollment.create({
      student: user._id,
      course: courseA._id,
      completed: true,
    });

    await ChallengeResult.create({
      playerOneId: user._id,
      score: 40,
      skill: 'Solidity',
    });

    const res = await request(app)
      .get('/api/recommendation/next-courses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseId: courseB._id.toString(),
          title: 'Solidity Fundamentals',
          reason: expect.any(String),
        }),
      ])
    );
  });
});
