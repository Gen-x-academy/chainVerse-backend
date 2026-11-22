import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectScheduleRiskModule } from './project-schedule-risk.module';
import { ProjectScheduleRiskService } from './project-schedule-risk.service';

describe('ProjectScheduleRiskModule wiring', () => {
  it('resolves the service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProjectScheduleRiskModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    expect(moduleRef.get(ProjectScheduleRiskService)).toBeDefined();
  });
});
