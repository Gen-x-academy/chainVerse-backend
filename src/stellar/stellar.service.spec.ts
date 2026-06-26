import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
        submitTransaction: jest.fn(),
      })),
    },
  };
});

describe('StellarService', () => {
  let service: StellarService;
  let mockServer: {
    loadAccount: jest.Mock;
    submitTransaction: jest.Mock;
    transactions?: jest.Mock;
    operations?: jest.Mock;
  };
  let configGet: jest.Mock;

  beforeEach(async () => {
    configGet = jest.fn((key: string) => {
      const config: Record<string, string> = {
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_NETWORK: 'testnet',
        CONTRACT_CHV_TOKEN: '',
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    mockServer = service.getServer() as unknown as typeof mockServer;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isTestnet', () => {
    it('returns true when STELLAR_NETWORK is testnet', () => {
      expect(service.isTestnet()).toBe(true);
    });

    it('returns false when STELLAR_NETWORK is public', () => {
      configGet.mockImplementation((key: string) =>
        key === 'STELLAR_NETWORK' ? 'public' : undefined,
      );
      expect(service.isTestnet()).toBe(false);
    });
  });

  describe('isValidPublicKey', () => {
    it('returns true for a valid G... Stellar public key', () => {
      const validKey = StellarSdk.Keypair.random().publicKey();
      expect(service.isValidPublicKey(validKey)).toBe(true);
    });

    it('returns false for a random string', () => {
      expect(service.isValidPublicKey('not-a-stellar-key')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(service.isValidPublicKey('')).toBe(false);
    });
  });

  describe('verifyPayment', () => {
    beforeEach(() => {
      const txBuilder = {
        transaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ successful: true }),
        }),
      };
      mockServer.transactions = jest.fn().mockReturnValue(txBuilder);
      mockServer.operations = jest.fn().mockReturnValue({
        forTransaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                type: 'payment',
                to: 'GDEST',
                amount: '10',
              },
            ],
          }),
        }),
      });
    });

    it('returns verified: true when a matching payment operation exists', async () => {
      const result = await service.verifyPayment({
        transactionHash: 'abc123hash',
        expectedAmount: '10',
        expectedDestination: 'GDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
      expect(result.transactionId).toBe('abc123hash');
      expect(typeof result.timestamp).toBe('string');
    });

    it('returns verified: false when tx is not successful', async () => {
      mockServer.transactions = jest.fn().mockReturnValue({
        transaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({ successful: false }),
        }),
      });

      const result = await service.verifyPayment({
        transactionHash: 'bad-hash',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('getAccount', () => {
    it('returns account details on success', async () => {
      const accountId = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV4UHEIPZXB';
      const mockAccount = { id: accountId, sequence: '123' };
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccount(accountId);

      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
      expect(result).toEqual(mockAccount);
    });

    it('throws when account lookup fails', async () => {
      mockServer.loadAccount.mockRejectedValue(new Error('Account not found'));

      await expect(service.getAccount('GA...')).rejects.toThrow(
        'Account not found',
      );
    });
  });

  describe('submitTransaction', () => {
    it('submits transaction successfully', async () => {
      const mockTx = {} as StellarSdk.Transaction;
      const mockResponse = { successful: true, hash: 'hash123' };
      mockServer.submitTransaction.mockResolvedValue(mockResponse);

      const result = await service.submitTransaction(mockTx);

      expect(mockServer.submitTransaction).toHaveBeenCalledWith(mockTx);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('createAccount', () => {
    it('rejects account creation on mainnet with setup guidance', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'STELLAR_NETWORK') return 'public';
        if (key === 'STELLAR_HORIZON_URL')
          return 'https://horizon.stellar.org';
        return undefined;
      });

      await expect(service.createAccount()).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates and funds a testnet account without persisting the secret', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
      mockServer.loadAccount.mockResolvedValue({
        id: 'GTEST',
        balances: [],
      });

      const result = await service.createAccount();

      expect(result.publicKey).toMatch(/^G/);
      expect(result.secretKey).toMatch(/^S/);
      expect(result.funded).toBe(true);
      expect(result.network).toBe('testnet');
      expect(result.message).toContain('does not store it');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('friendbot.stellar.org'),
      );
      expect(mockServer.loadAccount).toHaveBeenCalledWith(result.publicKey);
    });

    it('throws when Friendbot funding fails', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: false } as Response);

      await expect(service.createAccount()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
