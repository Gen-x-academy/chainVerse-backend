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
  let mockServer: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService],
    }).compile();

    service = module.get<StellarService>(StellarService);
    mockServer = service.getServer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAccount', () => {
    it('should return account details on success (happy path)', async () => {
      const accountId = 'GA...';
      const mockAccount = { id: accountId, sequence: '123' };
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccount(accountId);

      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
      expect(result).toEqual(mockAccount);
    });

    it('should throw error on failure (failure path)', async () => {
      const accountId = 'GA...';
      const error = new Error('Account not found');
      mockServer.loadAccount.mockRejectedValue(error);

      await expect(service.getAccount(accountId)).rejects.toThrow(
        'Account not found',
      );
      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
    });
  });

  describe('isValidPublicKey', () => {
    it('returns true for a valid G... Stellar public key', () => {
      const validKey = 'GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV4UHEIPZXB';
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
      const mockTxBuilder = {
        transaction: jest.fn().mockReturnThis(),
        call: jest.fn(),
      };
      mockServer.transactions = jest.fn().mockReturnValue(mockTxBuilder);
    });

    it('returns { verified: true } when Horizon reports the transaction as successful', async () => {
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'abc123',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
      expect(result.transactionId).toBe('abc123');
      expect(typeof result.timestamp).toBe('string');
    });

    it('returns { verified: false } when transaction is not successful', async () => {
      mockServer.transactions().call.mockResolvedValue({ successful: false });

      const result = await service.verifyPayment({
        transactionHash: 'abc123',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
    });

    it('returns { verified: false } when Horizon returns null', async () => {
      mockServer.transactions().call.mockResolvedValue(null);

      const result = await service.verifyPayment({
        transactionHash: 'missing-hash',
        expectedAmount: '10',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('submitTransaction', () => {
    it('should submit transaction successfully (happy path)', async () => {
      const mockTx = {} as StellarSdk.Transaction;
      const mockResponse = { successful: true, hash: 'hash123' };
      mockServer.submitTransaction.mockResolvedValue(mockResponse);

      const result = await service.submitTransaction(mockTx);

      expect(mockServer.submitTransaction).toHaveBeenCalledWith(mockTx);
      expect(result).toEqual(mockResponse);
    });

    it('should throw error on failure (failure path)', async () => {
      const mockTx = {} as StellarSdk.Transaction;
      const error = new Error('Transaction failed');
      mockServer.submitTransaction.mockRejectedValue(error);

      await expect(service.submitTransaction(mockTx)).rejects.toThrow(
        'Transaction failed',
      );
      expect(mockServer.submitTransaction).toHaveBeenCalledWith(mockTx);
    });
  });
});
