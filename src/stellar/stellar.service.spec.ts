import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { StellarService } from './stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  const mockServer = {
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    transactions: jest.fn(),
    operations: jest.fn(),
  };
  return {
    ...original,
    Horizon: {
      Server: jest.fn().mockImplementation(() => mockServer),
    },
  };
});

describe('StellarService', () => {
  let service: StellarService;
  let mockServer: {
    loadAccount: jest.Mock;
    submitTransaction: jest.Mock;
    transactions: jest.Mock;
    operations: jest.Mock;
  };
  let configGet: jest.Mock;
  let mockVerifiedPaymentModel: {
    findOne: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    configGet = jest.fn((key: string) => {
      const config: Record<string, string> = {
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_NETWORK: 'testnet',
        CONTRACT_CHV_TOKEN: '',
      };
      return config[key];
    });

    mockVerifiedPaymentModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
        {
          provide: getModelToken('VerifiedPayment'),
          useValue: mockVerifiedPaymentModel,
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
      const validKey =
        'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      expect(service.isValidPublicKey(validKey)).toBe(true);
    });

    it('returns false for a random string', () => {
      expect(service.isValidPublicKey('not-a-stellar-key')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(service.isValidPublicKey('')).toBe(false);
    });
  });

  describe('getAccount', () => {
    it('should return account details on success (happy path)', async () => {
      const accountId =
        'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      const mockAccount = { id: accountId, sequence: '123' };
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccount(accountId);

      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
      expect(result).toEqual(mockAccount);
    });

    it('should throw error on failure (failure path)', async () => {
      const accountId =
        'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      const error = new Error('Account not found');
      mockServer.loadAccount.mockRejectedValue(error);

      await expect(service.getAccount(accountId)).rejects.toThrow(
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
        if (key === 'STELLAR_HORIZON_URL') return 'https://horizon.stellar.org';
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

      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('secretKey');
      expect(result.funded).toBe(true);
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

    it('returns { verified: true } when Horizon reports the transaction as successful', async () => {
      const result = await service.verifyPayment({
        transactionHash: 'abc123',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
      expect(mockVerifiedPaymentModel.create).toHaveBeenCalledTimes(1);
      expect(mockVerifiedPaymentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionHash: 'abc123',
          verified: true,
        }),
      );
    });

    it('returns { verified: false } for wrong amount', async () => {
      const opsBuilder = {
        forTransaction: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [
            {
              type: 'payment',
              to: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
              amount: '50',
            },
          ],
        }),
      };
      mockServer.operations = jest.fn().mockReturnValue(opsBuilder);

      const result = await service.verifyPayment({
        transactionHash: 'wrong-amount-hash',
        expectedAmount: '100',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
      expect(mockVerifiedPaymentModel.create).toHaveBeenCalledTimes(1);
    });

    it('returns { verified: false } for wrong destination', async () => {
      const opsBuilder = {
        forTransaction: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [
            {
              type: 'payment',
              to: 'GWRONGWRONGWRONGWRONGWRONGWRONGWRONGWRONG',
              amount: '100',
            },
          ],
        }),
      };
      mockServer.operations = jest.fn().mockReturnValue(opsBuilder);

      const result = await service.verifyPayment({
        transactionHash: 'missing-hash',
        expectedAmount: '10',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
      expect(mockVerifiedPaymentModel.create).toHaveBeenCalledTimes(1);
    });

    it('returns { verified: true } for matching amount and destination', async () => {
      const opsBuilder = {
        forTransaction: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [
            {
              type: 'payment',
              to: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
              amount: '100',
            },
          ],
        }),
      };
      mockServer.operations = jest.fn().mockReturnValue(opsBuilder);

      const result = await service.verifyPayment({
        transactionHash: 'valid-hash',
        expectedAmount: '100',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
      expect(mockVerifiedPaymentModel.create).toHaveBeenCalledTimes(1);
    });

    it('returns { verified: false } when Horizon throws an error', async () => {
      mockServer.transactions = jest.fn().mockReturnValue({
        transaction: jest.fn().mockReturnValue({
          call: jest.fn().mockRejectedValue(new Error('not found')),
        }),
      });

      const result = await service.verifyPayment({
        transactionHash: 'error-hash',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
      expect(mockVerifiedPaymentModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyPayment – idempotency', () => {
    it('returns the original result for a previously verified transaction without duplicate persistence', async () => {
      const existingRecord = {
        transactionHash: 'idempotent-hash',
        verified: true,
        createdAt: new Date('2026-01-15T10:00:00Z'),
      };

      mockVerifiedPaymentModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingRecord),
        }),
      });

      const result = await service.verifyPayment({
        transactionHash: 'idempotent-hash',
        expectedAmount: '50',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
      expect(result.transactionId).toBe('idempotent-hash');
      expect(mockVerifiedPaymentModel.create).not.toHaveBeenCalled();
      expect(mockServer.transactions).not.toHaveBeenCalled();
    });

    it('returns the original result for a previously failed transaction', async () => {
      const existingRecord = {
        transactionHash: 'failed-hash',
        verified: false,
        createdAt: new Date('2026-01-15T10:00:00Z'),
      };

      mockVerifiedPaymentModel.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingRecord),
        }),
      });

      const result = await service.verifyPayment({
        transactionHash: 'failed-hash',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
      expect(mockVerifiedPaymentModel.create).not.toHaveBeenCalled();
      expect(mockServer.transactions).not.toHaveBeenCalled();
    });
  });
});
