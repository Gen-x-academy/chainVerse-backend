const request = require('supertest');
const mongoose = require('mongoose');

// MOCK DB CONNECT to prevent app.js from connecting to real DB
jest.mock('../config/database/connection', () => jest.fn());

// MOCK REPORT SCHEDULER
jest.mock('../services/reportScheduler', () => ({
    initScheduler: jest.fn()
}));

// MOCK REDIS
jest.mock('redis', () => ({
    createClient: () => ({
        on: jest.fn(),
        connect: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        setEx: jest.fn(),
    })
}));

// MOCK IOREDIS
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        status: 'ready',
        // Add other methods if needed
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

// Set JWT Secret for testing
process.env.JWT_SECRET = 'testsecret';

const app = require('../../app'); // Adjust path to app.js
const { connectTestDB, disconnectTestDB, clearTestDB, createTestUser, generateTestToken } = require('./testUtils');
const Book = require('../models/book');
const Course = require('../models/course');

describe('Book Recommendations Feature', () => {
    let adminToken;
    let tutorToken;
    let studentToken;
    let adminUser;
    let tutorUser;
    let studentUser;

    beforeAll(async () => {
        await connectTestDB();
    }, 30000);

    afterAll(async () => {
        await disconnectTestDB();
    });

    beforeEach(async () => {
        await clearTestDB();

        // Setup users
        adminUser = await createTestUser({
            email: 'admin@test.com',
            role: 'admin',
            name: 'Admin User'
        });
        adminToken = generateTestToken(adminUser);

        tutorUser = await createTestUser({
            email: 'tutor@test.com',
            role: 'tutor',
            name: 'Tutor User'
        });
        tutorToken = generateTestToken(tutorUser);

        studentUser = await createTestUser({
            email: 'student@test.com',
            role: 'student',
            name: 'Student User'
        });
        studentToken = generateTestToken(studentUser);
    });

    describe('Book Management (CRUD)', () => {
        it('should allow admin to create a book', async () => {
            const res = await request(app)
                .post('/api/books')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'Clean Code',
                    author: 'Robert C. Martin',
                    description: 'A Handbook of Agile Software Craftsmanship',
                    isbn: '978-0132350884'
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.title).toBe('Clean Code');

            const bookId = res.body.data._id;
            const book = await Book.findById(bookId);
            expect(book).toBeTruthy();
        });

        it('should allow tutor to create a book', async () => {
            const res = await request(app)
                .post('/api/books')
                .set('Authorization', `Bearer ${tutorToken}`)
                .send({
                    title: 'Refactoring',
                    author: 'Martin Fowler'
                });

            expect(res.statusCode).toBe(201);
        });

        it('should NOT allow student to create a book', async () => {
            const res = await request(app)
                .post('/api/books')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    title: 'Hacked Book',
                    author: 'Hacker'
                });

            expect(res.statusCode).toBe(403);
        });
    });

    describe('Course Book Assignment', () => {
        let book1, book2, course;

        beforeEach(async () => {
            // Create books
            book1 = await Book.create({
                title: 'The Pragmatic Programmer',
                author: 'Andrew Hunt'
            });

            book2 = await Book.create({
                title: 'Introduction to Algorithms',
                author: 'Thomas H. Cormen'
            });

            // Create course
            course = await Course.create({
                title: 'Software Engineering 101',
                description: 'Intro to SE',
                tutor: tutorUser._id,
                tutorEmail: tutorUser.email,
                tutorName: tutorUser.name || 'Tutor',
                videos: [
                    {
                        title: 'Module 1: Basics',
                        url: 'http://example.com/video1',
                        order: 1
                    }
                ]
            });
        });

        it('should assign a book to the course level', async () => {
            const res = await request(app)
                .post(`/api/courses/${course._id}/books`) // Using the route mounted at /courses
                .set('Authorization', `Bearer ${tutorToken}`)
                .send({
                    bookId: book1._id,
                    required: true,
                    priority: 1
                });

            expect(res.statusCode).toBe(200);

            const updatedCourse = await Course.findById(course._id);
            expect(updatedCourse.recommendedBooks).toHaveLength(1);
            expect(updatedCourse.recommendedBooks[0].book.toString()).toBe(book1._id.toString());
            expect(updatedCourse.recommendedBooks[0].required).toBe(true);
        });

        it('should assign a book to a specific module', async () => {
            const moduleId = course.videos[0]._id;

            const res = await request(app)
                .post(`/api/courses/${course._id}/books`)
                .set('Authorization', `Bearer ${tutorToken}`)
                .send({
                    bookId: book2._id,
                    videoId: moduleId,
                    required: false,
                    priority: 2
                });

            expect(res.statusCode).toBe(200);

            const updatedCourse = await Course.findById(course._id);
            expect(updatedCourse.videos[0].recommendedBooks).toHaveLength(1);
            expect(updatedCourse.videos[0].recommendedBooks[0].book.toString()).toBe(book2._id.toString());
        });

        it('should retrieve organized/cached books for a course', async () => {
            // Setup: Assign 1 course book and 1 module book
            const moduleId = course.videos[0]._id;

            // Assign course book
            await request(app)
                .post(`/api/courses/${course._id}/books`)
                .set('Authorization', `Bearer ${tutorToken}`)
                .send({ bookId: book1._id, required: true, priority: 1 });

            // Assign module book
            await request(app)
                .post(`/api/courses/${course._id}/books`)
                .set('Authorization', `Bearer ${tutorToken}`)
                .send({ bookId: book2._id, videoId: moduleId, required: false });

            // Retrieve
            const res = await request(app)
                .get(`/api/courses/${course._id}/books`)
                .set('Authorization', `Bearer ${studentToken}`); // Students can view

            expect(res.statusCode).toBe(200);
            expect(res.body.data.courseBooks).toHaveLength(1);
            expect(res.body.data.courseBooks[0].title).toBe('The Pragmatic Programmer');

            expect(res.body.data.moduleBooks).toHaveLength(1);
            expect(res.body.data.moduleBooks[0].title).toBe('Introduction to Algorithms');
            expect(res.body.data.moduleBooks[0].moduleTitle).toBe('Module 1: Basics');
        });
    });
});
