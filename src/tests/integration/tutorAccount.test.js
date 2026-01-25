// NEUTRALIZE CRON (The Timeout Issue)
// This prevents 'node-cron' from ever starting the background timer.
jest.mock('node-cron', () => ({
    schedule: jest.fn(),
}));

// NEUTRALIZE REDIS (The TCPWRAP Issue)
// This replaces the real Redis client with a "fake" one that does nothing.
jest.mock('redis', () => ({
    createClient: jest.fn(() => ({
        connect: jest.fn(),
        on: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        quit: jest.fn(),
        disconnect: jest.fn(),
    })),
}));

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = require('../../../app');
const Tutor = require('../../models/tutors');

process.env.JWT_ACCESS_TOKEN = process.env.JWT_ACCESS_TOKEN || 'test_secret_key_fixed_for_jest';

describe('Tutor Account Integration Tests', () => {
    let tutor;
    let token;

    beforeAll(async () => {
        // Create a test tutor
        tutor = await Tutor.create({
            fullName: 'Test Tutor',
            email: 'testtutor@example.com',
            password: 'Password123!',
            web3Expertise: 'Ethereum',
            experience: 5,
            verified: true
        });

        token = jwt.sign({ sub: tutor._id }, process.env.JWT_ACCESS_TOKEN);
    });

    afterAll(async () => {
        await Tutor.deleteMany({ email: 'testtutor@example.com' });
        await mongoose.connection.close();
    });

    describe('GET /api/tutor/account', () => {
        it('should retrieve tutor details', async () => {
            const res = await request(app)
                .get('/api/tutor/account')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.tutor.email).toBe('testtutor@example.com');
            expect(res.body.tutor).not.toHaveProperty('password');
        });

        it('should return 401 if not authenticated', async () => {
            const res = await request(app).get('/api/tutor/account');
            expect(res.status).toBe(401);
        });
    });

    describe('PUT /api/tutor/account/update', () => {
        it('should update tutor profile', async () => {
            const res = await request(app)
                .put('/api/tutor/account/update')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    fullName: 'Updated Name',
                    phoneNumber: '1234567890',
                    bio: 'Updated bio'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.tutor.fullName).toBe('Updated Name');
            expect(res.body.tutor.phoneNumber).toBe('1234567890');
            expect(res.body.tutor.bio).toBe('Updated bio');
        });

        it('should return 400 for invalid email', async () => {
            const res = await request(app)
                .put('/api/tutor/account/update')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: 'invalid-email'
                });

            expect(res.status).toBe(400);
        });
    });

    describe('PUT /api/tutor/account/change-password', () => {
        it('should change password with correct current password', async () => {
            const res = await request(app)
                .put('/api/tutor/account/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: 'Password123!',
                    newPassword: 'NewPassword456!'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify password was changed
            const updatedTutor = await Tutor.findById(tutor._id).select('+password');
            const isMatch = await updatedTutor.comparePassword('NewPassword456!');
            expect(isMatch).toBe(true);
        });

        it('should return 401 for incorrect current password', async () => {
            const res = await request(app)
                .put('/api/tutor/account/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: 'WrongPassword!',
                    newPassword: 'AnotherPassword789!'
                });

            expect(res.status).toBe(401);
        });

        it('should return 429 for too many requests', async () => {
            // Already 2 requests made (1 success, 1 fail)
            // Need 2 more to exceed limit of 3

            // 3rd request
            await request(app)
                .put('/api/tutor/account/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: 'NewPassword456!',
                    newPassword: 'AnotherPassword!'
                });

            // 4th request
            const res = await request(app)
                .put('/api/tutor/account/change-password')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    currentPassword: 'NewPassword456!',
                    newPassword: 'AnotherPassword!'
                });

            expect(res.status).toBe(429);
        });
    });
});
