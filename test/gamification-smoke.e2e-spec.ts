import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Smoke tests for the gamification system.
 * Verifies that BadgeModule, GamificationPointsModule, and
 * CoursePerformanceLeaderboardModule are registered and their
 * main GET endpoints respond (not 404).
 */
describe('Gamification smoke tests (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/badges responds (BadgeModule registered)', () =>
    request(app.getHttpServer())
      .get('/api/badges')
      .expect((res) => {
        expect(res.status).not.toBe(404);
      }));

  it('GET /api/gamification/points responds (GamificationPointsModule registered)', () =>
    request(app.getHttpServer())
      .get('/api/gamification/points')
      .expect((res) => {
        expect(res.status).not.toBe(404);
      }));

  it('GET /api/courses/performance-leaderboard responds (CoursePerformanceLeaderboardModule registered)', () =>
    request(app.getHttpServer())
      .get('/api/courses/performance-leaderboard')
      .expect((res) => {
        expect(res.status).not.toBe(404);
      }));
});
