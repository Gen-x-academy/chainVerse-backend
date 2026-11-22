import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectGovernanceExportModule } from './project-governance-export.module';
import { ProjectGovernanceExportService } from './project-governance-export.service';

describe('ProjectGovernanceExportModule wiring', () => {
  it('resolves the service with the milestone source injected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProjectGovernanceExportModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const service = moduleRef.get(ProjectGovernanceExportService);
    expect(service).toBeDefined();
    expect(
      (service as unknown as { milestoneSource?: unknown }).milestoneSource,
    ).toBeDefined();
    expect(
      (service as unknown as { financeSource?: unknown }).financeSource,
    ).toBeUndefined();
  });
});
