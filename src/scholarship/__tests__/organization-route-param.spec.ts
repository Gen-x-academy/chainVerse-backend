import { PATH_METADATA } from '@nestjs/common/constants';
import { ORG_SCOPE_KEY } from '../../common/decorators/org-roles.decorator';
import { ORGANIZATION_ID_PARAM } from '../../common/decorators/organization-id-param.decorator';
import { ScholarshipAwardController } from '../controllers/scholarship-award.controller';
import { MilestoneScheduleController } from '../controllers/milestone-schedule.controller';
import { MilestoneVerificationController } from '../controllers/milestone-verification.controller';
import { MilestoneEvidenceController } from '../controllers/milestone-evidence.controller';
import { DisbursementIntentController } from '../controllers/disbursement-intent.controller';

const controllers = [
  ScholarshipAwardController,
  MilestoneScheduleController,
  MilestoneVerificationController,
  MilestoneEvidenceController,
  DisbursementIntentController,
];

describe('scholarship controllers use the canonical organization route parameter', () => {
  it.each(controllers.map((c) => [c.name, c] as const))(
    '%s names it :organizationId',
    (_name, controller) => {
      const path: string = Reflect.getMetadata(PATH_METADATA, controller);

      expect(path).toContain(`organizations/:${ORGANIZATION_ID_PARAM}/`);
      expect(path).not.toContain(':orgId');
    },
  );

  it.each(controllers.map((c) => [c.name, c] as const))(
    '%s resolves the guard scope from the same key',
    (_name, controller) => {
      const scope = Reflect.getMetadata(ORG_SCOPE_KEY, controller);

      // MilestoneEvidenceController is authorised by its own service-level checks and
      // declares no scope; where a scope exists it must point at the path parameter.
      if (scope) {
        expect(scope).toEqual({ source: 'param', key: ORGANIZATION_ID_PARAM });
      }
    },
  );
});
