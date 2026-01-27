const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('hashed_password'),
    compare: jest.fn().mockResolvedValue(true),
    genSalt: jest.fn().mockResolvedValue('salt')
}));
jest.mock('canvas', () => ({}));
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        publish: jest.fn(),
        set: jest.fn(),
        get: jest.fn(),
        quit: jest.fn(),
    }));
});
jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
    })),
    Worker: jest.fn(),
}));

// Import strict dependencies for this feature
const leaderboardRoutes = require('../../routes/leaderboardRoutes');
const Challenge = require('../../models/Challenge');
const ChallengeResult = require('../../models/ChallengeResult');
const Student = require('../../models/student');

describe('Leaderboard API', () => {
    let app;
    let mongoServer;
    let student1, student2, student3;
    let courseId = uuidv4();
    let moduleId = uuidv4();
    let otherCourseId = uuidv4();

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        app = express();
        app.use(express.json());
        app.use('/api/leaderboard', leaderboardRoutes);
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        await Challenge.deleteMany({});
        await ChallengeResult.deleteMany({});
        await Student.deleteMany({});

        // Create Students
        student1 = await Student.create({ name: 'Alice', email: 'alice@test.com', profileImage: 'alice.jpg' });
        student2 = await Student.create({ name: 'Bob', email: 'bob@test.com', profileImage: 'bob.jpg' });
        student3 = await Student.create({ name: 'Charlie', email: 'charlie@test.com' });

        // Helper to create match
        const createMatch = async (p1, p2, p1Score, p2Score, winner, course, date = new Date()) => {
            const challenge = await Challenge.create({
                playerOneId: p1._id,
                playerTwoId: p2._id,
                quizId: 'quiz1',
                courseId: course,
                moduleId: moduleId,
                status: 'completed',
                completedAt: date,
                questions: Array(5).fill().map((_, i) => ({
                    questionId: `q${i}`,
                    text: `Question ${i}`,
                    options: [{ _id: 'a', text: 'A', isCorrect: true }, { _id: 'b', text: 'B', isCorrect: false }],
                    correctOptionId: 'a'
                }))
            });

            await ChallengeResult.create({
                challengeId: challenge._id,
                playerOneId: p1._id,
                playerTwoId: p2._id,
                playerOneScore: p1Score,
                playerTwoScore: p2Score,
                playerOneTime: 100,
                playerTwoTime: 100,
                winnerId: winner ? winner._id : null,
                completedAt: date,
                evaluatedAt: date
            });
        };

        const today = new Date();
        const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

        await createMatch(student1, student2, 5, 3, student1, courseId, today);

        await createMatch(student2, student3, 4, 2, student2, courseId, today);

        await createMatch(student1, student3, 5, 1, student1, courseId, today);

        await createMatch(student3, student2, 3, 2, student3, courseId, twoWeeksAgo);

        await createMatch(student2, student1, 5, 4, student2, otherCourseId, today);
    });

    describe('GET /api/leaderboard/course/:id', () => {
        it('should return all-time leaderboard for course correctly', async () => {
            const res = await request(app).get(`/api/leaderboard/course/${courseId}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const data = res.body.data;
            expect(data).toHaveLength(3);

            const alice = data.find(s => s._id === student1._id.toString());
            expect(alice).toBeDefined();
            expect(alice.wins).toBe(2);
            expect(alice.totalGames).toBe(2);
            expect(alice.winRate).toBe(100);
            expect(alice.totalPoints).toBe(10);
            expect(alice.rank).toBe(1);

            const bob = data.find(s => s._id === student2._id.toString());
            expect(bob.totalGames).toBe(3);
            expect(bob.wins).toBe(1);
            expect(bob.winRate).toBeCloseTo(33.3, 1);
        });

        it('should filter by weekly timeframe', async () => {
            const res = await request(app).get(`/api/leaderboard/course/${courseId}?timeFrame=weekly`);

            const data = res.body.data;

            const alice = data.find(s => s._id === student1._id.toString());
            expect(alice.totalGames).toBe(2);

            const bob = data.find(s => s._id === student2._id.toString());
            expect(bob.totalGames).toBe(2);
            expect(bob.wins).toBe(1);
            expect(bob.winRate).toBe(50);
        });

        it('should sort by totalPoints', async () => {
            const res = await request(app).get(`/api/leaderboard/course/${courseId}?sortBy=points`);
            const data = res.body.data;

            expect(data[0]._id).toBe(student1._id.toString());
            expect(data[1]._id).toBe(student2._id.toString());
            expect(data[2]._id).toBe(student3._id.toString());
        });
    });

    describe('GET /api/leaderboard/topic/:id', () => {
        it('should return leaderboard for specific topic/module', async () => {
            const res = await request(app).get(`/api/leaderboard/topic/${moduleId}`);
            expect(res.status).toBe(200);

            // Alice: 2 wins in course1 + 1 Loss in otherCourse. Total 3 games. 2 Wins. 66% win rate.
            const alice = res.body.data.find(s => s._id === student1._id.toString());
            expect(alice.totalGames).toBe(3);
            expect(alice.wins).toBe(2);
            expect(alice.winRate).toBeCloseTo(66.7, 1);
        });
    });
});
