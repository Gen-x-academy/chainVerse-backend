const request = require('supertest');
const mongoose = require('mongoose');

// MOCK DB CONNECT to prevent app.js from connecting to real DB
jest.mock('../config/database/connection', () => jest.fn());

// MOCK REPORT SCHEDULER
jest.mock('../services/reportScheduler', () => ({
  initScheduler: jest.fn(),
}));

// MOCK REDIS
jest.mock('redis', () => ({
  createClient: () => ({
    on: jest.fn(),
    connect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    setEx: jest.fn(),
  }),
}));

// MOCK IOREDIS
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    status: 'ready',
  }));
});

// MOCK BULLMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    on: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

process.env.JWT_SECRET = 'testsecret';

const app = require('../../app');
const {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
  createTestUser,
  generateTestToken,
} = require('./testUtils');

const Book = require('../models/book');
const Course = require('../models/course');
const Borrow = require('../models/Borrow');

describe('Library Books API (Public)', () => {
  let tutorUser;
  let tutorToken;

  beforeAll(async () => {
    await connectTestDB();
  }, 30000);

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    tutorUser = await createTestUser({
      email: 'tutor@test.com',
      role: 'tutor',
      name: 'Tutor User',
    });
    tutorToken = generateTestToken(tutorUser);
  });

  it('should list books with pagination (default recent)', async () => {
    await Book.create([
      { title: 'A', author: 'X', category: 'defi', tags: ['stellar'] },
      { title: 'B', author: 'Y', category: 'web3', tags: ['nft'] },
    ]);

    const res = await request(app).get('/api/library/books?page=1&limit=1');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.books).toHaveLength(1);
    expect(res.body.data.totalBooks).toBe(2);
    expect(res.body.data.totalPages).toBe(2);
  });

  it('should full-text search by title/author/tags/category', async () => {
    await Book.create([
      { title: 'Stellar DeFi Handbook', author: 'Alice', category: 'defi', tags: ['stellar'] },
      { title: 'Solidity Basics', author: 'Bob', category: 'evm', tags: ['solidity'] },
    ]);

    const res = await request(app).get('/api/library/books?search=stellar');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalBooks).toBe(1);
    expect(res.body.data.books[0].title).toMatch(/Stellar/i);
  });

  it('should filter by category and tags (OR semantics for tags)', async () => {
    await Book.create([
      { title: 'Book 1', author: 'A', category: 'defi', tags: ['stellar'] },
      { title: 'Book 2', author: 'B', category: 'defi', tags: ['nft'] },
      { title: 'Book 3', author: 'C', category: 'web3', tags: ['nft'] },
    ]);

    const res = await request(app).get('/api/library/books?category=defi&tags=nft,stellar');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalBooks).toBe(2);
    const titles = res.body.data.books.map((b) => b.title);
    expect(titles).toEqual(expect.arrayContaining(['Book 1', 'Book 2']));
  });

  it('should apply courseId intersection with other filters', async () => {
    const [book1, book2, book3] = await Book.create([
      { title: 'DeFi 1', author: 'A', category: 'defi', tags: ['stellar'] },
      { title: 'Web3 1', author: 'B', category: 'web3', tags: ['nft'] },
      { title: 'DeFi 2', author: 'C', category: 'defi', tags: ['nft'] },
    ]);

    const course = await Course.create({
      title: 'Course 1',
      description: 'x',
      tutor: tutorUser._id,
      tutorEmail: tutorUser.email,
      tutorName: tutorUser.name || 'Tutor',
      videos: [
        {
          title: 'Module 1',
          url: 'http://example.com/video1',
          order: 1,
          recommendedBooks: [{ book: book2._id, required: false, priority: 0 }],
        },
      ],
      recommendedBooks: [{ book: book1._id, required: true, priority: 1 }],
    });

    // Intersection: only course books (book1, book2) AND category=defi -> only book1
    const res = await request(app).get(
      `/api/library/books?courseId=${course._id}&category=defi`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalBooks).toBe(1);
    expect(res.body.data.books[0].title).toBe('DeFi 1');
  });

  it('should sort by popular (most borrowed) and include borrowCount', async () => {
    const [bookA, bookB] = await Book.create([
      { title: 'Popular A', author: 'A', category: 'defi', tags: ['stellar'] },
      { title: 'Popular B', author: 'B', category: 'defi', tags: ['stellar'] },
    ]);

    const userId = new mongoose.Types.ObjectId();
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 3 borrows for A, 1 for B
    await Borrow.create([
      { userId, resourceId: bookA._id, resourceType: 'book', resourceTitle: bookA.title, expiryDate: expiry },
      { userId, resourceId: bookA._id, resourceType: 'book', resourceTitle: bookA.title, expiryDate: expiry },
      { userId, resourceId: bookA._id, resourceType: 'book', resourceTitle: bookA.title, expiryDate: expiry },
      { userId, resourceId: bookB._id, resourceType: 'book', resourceTitle: bookB.title, expiryDate: expiry },
    ]);

    const res = await request(app).get('/api/library/books?sort=popular&limit=10');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.books[0].title).toBe('Popular A');
    expect(res.body.data.books[0].borrowCount).toBe(3);
    expect(res.body.data.books[1].borrowCount).toBe(1);
  });
});

