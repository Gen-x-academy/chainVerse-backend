import { Test, TestingModule } from '@nestjs/testing';
import { StellarModule } from './stellar.module';
import { StellarService } from './stellar.service';

describe('StellarService (Integration)', () => {
  let service: StellarService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [StellarModule],
    }).compile();

    service = moduleFixture.get<StellarService>(StellarService);
  });

  it('should hit the Stellar testnet and fetch an account', async () => {
    // This is a known account from the be-energy-submission.md doc, or any valid testnet account
    const knownTestnetAccount =
      'GCHCYTHV4JSIJNCN56EIEXZNTB6JUHYX25FTSYFOM4DDVGV7UXWOHLCW';

    try {
      const account = await service.getAccount(knownTestnetAccount);
      expect(account).toBeDefined();
      expect(account.id).toBe(knownTestnetAccount);
      expect(account.sequence).toBeDefined();
    } catch (e) {
      // If the account was removed, it will throw a 404, which still means it reached the network
      expect(e.response).toBeDefined();
      expect(e.response.status).toBe(404);
    }
  });

  it('should throw an error for an invalid account id format', async () => {
    const invalidAccount = 'INVALID_ACCOUNT_ID';

    await expect(service.getAccount(invalidAccount)).rejects.toThrow();
  });
});
