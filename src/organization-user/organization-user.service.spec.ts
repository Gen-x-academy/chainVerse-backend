import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationUserService } from './organization-user.service';

describe('OrganizationUserService', () => {
  let service: OrganizationUserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationUserService],
    }).compile();

    service = module.get<OrganizationUserService>(OrganizationUserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
