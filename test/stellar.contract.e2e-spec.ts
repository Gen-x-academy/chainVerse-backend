import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { StellarService } from '../src/stellar/stellar.service';

describe('Stellar Contract (e2e)', () => {
  let app: INestApplication;
  let stellarService: StellarService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    stellarService = app.get(StellarService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a new Stellar account and fund it', async () => {
    const account = await stellarService.createAccount();

    expect(account.publicKey).toBeDefined();
    expect(account.secretKey).toBeDefined();
    expect(account.funded).toBe(true);
  });
});
