import { SetMetadata } from '@nestjs/common';
import { ProjectFundingRole } from './entities';

export const PROJECT_FUNDING_ROLES_KEY = 'projectFundingRoles';

export const ProjectFundingRoles = (...roles: ProjectFundingRole[]) =>
  SetMetadata(PROJECT_FUNDING_ROLES_KEY, roles);
