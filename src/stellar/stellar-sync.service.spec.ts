import { StellarSyncService } from './stellar-sync.service';

describe('StellarSyncService', () => {
  let service: StellarSyncService;
  let certTxModel: { find: jest.Mock };
  let stellarService: { getServer: jest.Mock };
  let record: {
    certificateId: string;
    transactionHash: string;
    status: string;
    save: jest.Mock;
  };
  let transactionCall: jest.Mock;

  beforeEach(() => {
    record = {
      certificateId: 'cert-1',
      transactionHash: 'tx-1',
      status: 'pending',
      save: jest.fn().mockResolvedValue(undefined),
    };

    certTxModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([record]),
      }),
    };

    transactionCall = jest.fn().mockResolvedValue({ successful: true });
    stellarService = {
      getServer: jest.fn().mockReturnValue({
        transactions: () => ({
          transaction: () => ({ call: transactionCall }),
        }),
      }),
    };

    service = new StellarSyncService(
      certTxModel as any,
      stellarService as any,
    );
  });

  it('returns early when there are no pending transactions', async () => {
    certTxModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });

    await service.syncPending();

    expect(certTxModel.find).toHaveBeenCalledWith({ status: 'pending' });
    expect(stellarService.getServer).not.toHaveBeenCalled();
  });

  it('marks a successful transaction as confirmed', async () => {
    await service.syncPending();

    expect(transactionCall).toHaveBeenCalled();
    expect(record.status).toBe('confirmed');
    expect(record.save).toHaveBeenCalled();
  });

  it('marks an unsuccessful transaction as failed', async () => {
    transactionCall.mockResolvedValue({ successful: false });

    await service.syncPending();

    expect(record.status).toBe('failed');
    expect(record.save).toHaveBeenCalled();
  });

  it('leaves the record pending when the Horizon lookup fails', async () => {
    transactionCall.mockRejectedValue(new Error('horizon unavailable'));

    await expect(service.syncPending()).resolves.toBeUndefined();

    expect(record.status).toBe('pending');
    expect(record.save).not.toHaveBeenCalled();
  });
});
