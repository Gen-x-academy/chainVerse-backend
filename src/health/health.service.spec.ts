import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthService } from './health.service';
import { StellarService } from '../stellar/stellar.service';

describe('HealthService', () => {
  let service: HealthService;
  let mockConnection: any;
  let mockStellarService: any;

  beforeEach(async () => {
    mockConnection = {
      db: {
        admin: jest.fn().mockReturnValue({
          ping: jest.fn().mockResolvedValue({ ok: 1 }),
        }),
      },
    };

    mockStellarService = {
      getServer: jest.fn().mockReturnValue({
        serverInfo: jest.fn().mockResolvedValue({
          protocol_version: 19,
          network_passphrase: 'Test SDF Network ; September 2015',
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('liveness', () => {
    it('should return ok status with uptime', () => {
      const result = service.liveness();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
    });
  });

  describe('readiness', () => {
    it('should return ok when all checks pass', async () => {
      const result = await service.readiness();
      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.stellar.status).toBe('ok');
    });

    it('should return degraded when database is down', async () => {
      mockConnection.db.admin.mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('connection refused')),
      });

      const result = await service.readiness();
      expect(result.status).toBe('degraded');
      expect(result.checks.database.status).toBe('error');
    });
  });

  describe('checkStellar', () => {
    it('should return ok when Stellar Horizon is reachable', async () => {
      const result = await service.checkStellar();
      expect(result.status).toBe('ok');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return error when Stellar Horizon is unreachable', async () => {
      mockStellarService.getServer.mockReturnValue({
        serverInfo: jest.fn().mockRejectedValue(new Error('connection timeout')),
      });

      const result = await service.checkStellar();
      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should return not_configured when StellarService is not available', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          {
            provide: getConnectionToken(),
            useValue: mockConnection,
          },
        ],
      }).compile();

      const svc = module.get<HealthService>(HealthService);
      const result = await svc.checkStellar();
      expect(result.status).toBe('not_configured');
    });
  });

  describe('checkDatabase', () => {
    it('should return ok when MongoDB is reachable', async () => {
      const result = await service.checkDatabase();
      expect(result.status).toBe('ok');
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return error when MongoDB ping fails', async () => {
      mockConnection.db.admin.mockReturnValue({
        ping: jest.fn().mockRejectedValue(new Error('not primary')),
      });

      const result = await service.checkDatabase();
      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should return not_configured when no db connection', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HealthService,
          {
            provide: getConnectionToken(),
            useValue: {},
          },
        ],
      }).compile();

      const svc = module.get<HealthService>(HealthService);
      const result = await svc.checkDatabase();
      expect(result.status).toBe('not_configured');
    });
  });
});
