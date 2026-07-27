import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Certification module smoke tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/certification/:id/download returns a downloadable certificate', async () => {
    const certificateId = 'test-certificate-id';

    const response = await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .expect(200);

    expect(response.headers['content-disposition']).toContain(
      `certificate-${certificateId}.txt`,
    );
    expect(response.text).toContain(certificateId);
  });
});
