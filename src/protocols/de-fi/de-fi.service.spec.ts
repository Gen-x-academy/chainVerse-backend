import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DeFiService, PROTOCOL_ADAPTERS } from './de-fi.service';
import { ProtocolMetadata } from './schemas/protocol-metadata.schema';
import { ProtocolAdapter } from '../protocol-adapter.inteface';

const mockProtocolModel: Record<string, jest.Mock> = {
  find: jest.fn(),
  findOne: jest.fn(),
};

describe('DeFiService', () => {
  let service: DeFiService;

  const mockAdapter: ProtocolAdapter = {
    name: 'test-protocol',
    supportedChains: ['ethereum', 'polygon'],
    getPosition: jest.fn(),
    getAllPositions: jest.fn(),
    deposit: jest.fn(),
    withdraw: jest.fn(),
    borrow: jest.fn(),
    repay: jest.fn(),
    getCollateralData: jest.fn(),
    getRewards: jest.fn(),
    claimRewards: jest.fn(),
    getAPY: jest.fn(),
    getTVL: jest.fn().mockResolvedValue(1000000),
    getProtocolMetrics: jest.fn().mockResolvedValue({
      tvl: 1000000,
      apy: 5.5,
      users: 1000,
      audits: ['certik'],
      insurance: true,
    }),
    getRiskMetrics: jest.fn(),
    estimateGas: jest.fn(),
    simulateTransaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeFiService,
        {
          provide: getModelToken(ProtocolMetadata.name),
          useValue: mockProtocolModel,
        },
        { provide: PROTOCOL_ADAPTERS, useValue: [mockAdapter] },
      ],
    }).compile();

    service = module.get<DeFiService>(DeFiService);
  });

  describe('discoverProtocols', () => {
    it('returns adapter-backed protocols and database protocols', async () => {
      const dbProtocols = [
        {
          name: 'db-protocol',
          type: 'yield',
          version: '1.0.0',
          supportedChains: ['ethereum'],
          tvl: 500000,
          apy: 3.0,
          audits: [],
          insurance: false,
          description: 'A yield protocol',
          website: 'https://example.com',
        },
      ];

      const mockQuery = {
        exec: jest.fn().mockResolvedValue(dbProtocols),
      };
      mockProtocolModel.find.mockReturnValue(mockQuery);

      const result = await service.discoverProtocols({});

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('test-protocol');
      expect(result[0].source).toBe('adapter');
      expect(result[1].name).toBe('db-protocol');
      expect(result[1].source).toBe('database');
    });

    it('filters by protocol name', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue([]),
      };
      mockProtocolModel.find.mockReturnValue(mockQuery);

      const result = await service.discoverProtocols({ name: 'test' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-protocol');
    });

    it('filters by type', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue([]),
      };
      mockProtocolModel.find.mockReturnValue(mockQuery);

      const result = await service.discoverProtocols({ type: 'lending' });

      expect(result).toHaveLength(0);
    });

    it('filters by chain', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue([]),
      };
      mockProtocolModel.find.mockReturnValue(mockQuery);

      const result = await service.discoverProtocols({ chains: ['polygon'] });

      expect(result).toHaveLength(1);
      expect(result[0].supportedChains).toContain('polygon');
    });

    it('skips adapters that fail', async () => {
      const failingAdapter: ProtocolAdapter = {
        ...mockAdapter,
        name: 'failing-protocol',
        getProtocolMetrics: jest.fn().mockRejectedValue(new Error('timeout')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DeFiService,
          {
            provide: getModelToken(ProtocolMetadata.name),
            useValue: mockProtocolModel,
          },
          { provide: PROTOCOL_ADAPTERS, useValue: [failingAdapter] },
        ],
      }).compile();

      const svc = module.get<DeFiService>(DeFiService);

      const mockQuery = {
        exec: jest.fn().mockResolvedValue([]),
      };
      mockProtocolModel.find.mockReturnValue(mockQuery);

      const result = await svc.discoverProtocols({});
      expect(result).toHaveLength(0);
    });
  });

  describe('findOneByName', () => {
    it('returns protocol from adapter when found', async () => {
      const result = await service.findOneByName('test-protocol');

      expect(result.name).toBe('test-protocol');
      expect(result.source).toBe('adapter');
      expect(result.tvl).toBe(1000000);
    });

    it('returns protocol from database when not in adapters', async () => {
      const dbProtocol = {
        name: 'db-protocol',
        type: 'yield',
        version: '2.0.0',
        supportedChains: ['ethereum'],
        tvl: 500000,
        apy: 3.0,
        audits: ['trail of bits'],
        insurance: false,
        description: 'A yield aggregator',
        website: 'https://yield.example.com',
      };

      const mockQuery = { exec: jest.fn().mockResolvedValue(dbProtocol) };
      mockProtocolModel.findOne.mockReturnValue(mockQuery);

      const result = await service.findOneByName('db-protocol');

      expect(result.name).toBe('db-protocol');
      expect(result.source).toBe('database');
      expect(result.version).toBe('2.0.0');
    });

    it('throws NotFoundException when protocol not found anywhere', async () => {
      const mockQuery = { exec: jest.fn().mockResolvedValue(null) };
      mockProtocolModel.findOne.mockReturnValue(mockQuery);

      await expect(service.findOneByName('nonexistent')).rejects.toThrow(
        'Protocol "nonexistent" not found',
      );
    });
  });
});
