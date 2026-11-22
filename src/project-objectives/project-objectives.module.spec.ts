import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectObjectivesModule } from './project-objectives.module';
import { ProjectObjectivesService } from './project-objectives.service';

describe('ProjectObjectivesModule wiring', () => {
  it('resolves the service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProjectObjectivesModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    expect(moduleRef.get(ProjectObjectivesService)).toBeDefined();
  });
});
