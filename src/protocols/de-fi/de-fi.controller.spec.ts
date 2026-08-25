import { Test, TestingModule } from '@nestjs/testing';
import { DeFiController } from './de-fi.controller';
import { DeFiService } from './de-fi.service';
import { QueryProtocolsDto } from './dto/query-protocols.dto';

describe('DeFiController', () => {
  let controller: DeFiController;

  const mockService = {
    discoverProtocols: jest.fn(),
    findOneByName: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeFiController],
      providers: [{ provide: DeFiService, useValue: mockService }],
    }).compile();

    controller = module.get<DeFiController>(DeFiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('discover', () => {
    it('calls service.discoverProtocols with query params', async () => {
      const query: QueryProtocolsDto = { name: 'aave', type: 'lending' };
      const expected = [
        {
          name: 'aave',
          type: 'lending',
          version: '1.0.0',
          supportedChains: ['ethereum'],
          tvl: 10000000,
          apy: 4.5,
          audits: ['certik'],
          insurance: true,
          source: 'adapter',
        },
      ];

      mockService.discoverProtocols.mockResolvedValue(expected);

      const result = await controller.discover(query);

      expect(result).toEqual(expected);
      expect(mockService.discoverProtocols).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('calls service.findOneByName with name param', async () => {
      const expected = {
        name: 'uniswap',
        type: 'dex',
        version: '1.0.0',
        supportedChains: ['ethereum', 'polygon'],
        tvl: 5000000,
        apy: 0,
        audits: [],
        insurance: false,
        source: 'database',
      };

      mockService.findOneByName.mockResolvedValue(expected);

      const result = await controller.findOne('uniswap');

      expect(result).toEqual(expected);
      expect(mockService.findOneByName).toHaveBeenCalledWith('uniswap');
    });
  });
});
