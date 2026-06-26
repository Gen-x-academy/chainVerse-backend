import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
  let mockServer: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org'),
          },
        },
      ],
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

  describe('isValidPublicKey', () => {
    it('returns true for a valid G... Stellar public key', () => {
      const validKey = 'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
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
        transaction: jest.fn().mockReturnThis(),
        call: jest.fn(),
      };
      mockServer.transactions = jest.fn().mockReturnValue(txBuilder);
      const opsBuilder = {
        forTransaction: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [
            {
              type: 'payment',
              to: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
              amount: '10',
            },
          ],
        }),
      };
      mockServer.operations = jest.fn().mockReturnValue(opsBuilder);
    });

    it('returns { verified: true } when Horizon reports the tx as successful', async () => {
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'abc123hash',
        expectedAmount: '10',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
      expect(result.transactionId).toBe('abc123hash');
      expect(typeof result.timestamp).toBe('string');
    });

    it('returns { verified: false } when tx is not successful', async () => {
      mockServer.transactions().call.mockResolvedValue({ successful: false });

      const result = await service.verifyPayment({
        transactionHash: 'bad-hash',
        expectedAmount: '10',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
    });

    it('returns { verified: false } when Horizon returns null', async () => {
      mockServer.transactions().call.mockResolvedValue(null);

      const result = await service.verifyPayment({
        transactionHash: 'missing',
        expectedAmount: '5',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-2',
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('getAccount', () => {
    it('should return account details on success (happy path)', async () => {
      const accountId = 'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      const mockAccount = { id: accountId, sequence: '123' };
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccount(accountId);

      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
      expect(result).toEqual(mockAccount);
    });

    it('should throw error on failure (failure path)', async () => {
      const accountId = 'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
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
      const validKey = 'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      expect(service.isValidPublicKey(validKey)).toBe(true);
    });

    it('returns false for a random string', () => {
      expect(service.isValidPublicKey('not-a-stellar-key')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(service.isValidPublicKey('')).toBe(false);
    });
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
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'valid-hash',
        expectedAmount: '100',
      mockServer.transactions = jest.fn().mockReturnValue(mockTxBuilder);
      const mockOpsBuilder = {
        forTransaction: jest.fn().mockReturnThis(),
        call: jest.fn().mockResolvedValue({
          records: [
            {
              type: 'payment',
              to: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
              amount: '10',
            },
          ],
        }),
      };
      mockServer.operations = jest.fn().mockReturnValue(mockOpsBuilder);
    });

    it('returns { verified: true } when Horizon reports the transaction as successful', async () => {
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'abc123',
        expectedAmount: '10',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
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
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'wrong-amount-hash',
        expectedAmount: '100',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
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
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'missing-hash',
        expectedAmount: '10',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
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
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'valid-hash',
        expectedAmount: '100',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(true);
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
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'wrong-amount-hash',
        expectedAmount: '100',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
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
      mockServer.transactions().call.mockResolvedValue({ successful: true });

      const result = await service.verifyPayment({
        transactionHash: 'wrong-dest-hash',
        expectedAmount: '100',
        expectedDestination: 'GDESTDESTDESTDESTDESTDESTDESTDESTDESTDEST',
        courseId: 'course-1',
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('getAccount', () => {
    it('should return account details on success (happy path)', async () => {
      const accountId = 'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      const mockAccount = { id: accountId, sequence: '123' };
      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const result = await service.getAccount(accountId);

      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
      expect(result).toEqual(mockAccount);
    });

    it('should throw error on failure (failure path)', async () => {
      const accountId = 'GD2LMJIK7BVUHJRJP3XKOIUE5NTISZFLGW7AUH36B5QUERZ3L7ILQQDA';
      const error = new Error('Account not found');
      mockServer.loadAccount.mockRejectedValue(error);

      await expect(service.getAccount(accountId)).rejects.toThrow(
        'Account not found',
      );
      expect(mockServer.loadAccount).toHaveBeenCalledWith(accountId);
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
