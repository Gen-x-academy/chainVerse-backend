import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('Cache Contract (e2e)', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    cacheManager = app.get(CACHE_MANAGER);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should set and get a value from the cache', async () => {
    const key = 'test-key';
    const value = 'test-value';

    await cacheManager.set(key, value);
    const cachedValue = await cacheManager.get(key);

    expect(cachedValue).toBe(value);
  });

  it('should return undefined for a non-existent key', async () => {
    const key = 'non-existent-key';
    const cachedValue = await cacheManager.get(key);

    expect(cachedValue).toBeUndefined();
  });
});
