import { Role } from '../../common/enums/role.enum';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { ConflictController } from './conflict.controller';
import { ConflictService } from './conflict.service';
import { DecideWaiverDto, RequestWaiverDto, RunConflictCheckDto } from './dto/conflict.dto';

const ctx: MentorshipRequestContext = {
  user: { id: 'admin-001', email: 'admin@example.com', role: Role.ADMIN },
};

function build() {
  const service = {
    runCheck: jest.fn().mockResolvedValue({ outcome: 'hard' }),
    explain: jest.fn().mockResolvedValue({ explanation: [] }),
    assertActivatable: jest.fn().mockResolvedValue({ activatable: true }),
    requestWaiver: jest.fn().mockResolvedValue({ status: 'requested' }),
    decideWaiver: jest.fn().mockResolvedValue({ status: 'approved' }),
  } as unknown as ConflictService;
  return { controller: new ConflictController(service), service };
}

describe('ConflictController (MENTOR-040)', () => {
  it('is protected by the JWT guard', () => {
    expect(Reflect.getMetadata('__guards__', ConflictController)).toHaveLength(1);
  });

  it('delegates check creation and explanation', async () => {
    const { controller, service } = build();
    const dto = { proposalId: 'p'.repeat(24) } as unknown as RunConflictCheckDto;
    await controller.runCheck(ctx, dto);
    expect(service.runCheck).toHaveBeenCalledWith(ctx, dto);
    await controller.explain(ctx, 'c'.repeat(24));
    expect(service.explain).toHaveBeenCalledWith(ctx, 'c'.repeat(24));
  });

  it('delegates the activation gate', async () => {
    const { controller, service } = build();
    await controller.activationReadiness(ctx, 'p'.repeat(24));
    expect(service.assertActivatable).toHaveBeenCalledWith(ctx, 'p'.repeat(24));
  });

  it('delegates the two-step waiver workflow', async () => {
    const { controller, service } = build();
    const request = { checkId: 'c'.repeat(24) } as unknown as RequestWaiverDto;
    const decision = { decision: 'approve' } as unknown as DecideWaiverDto;
    await controller.requestWaiver(ctx, request);
    expect(service.requestWaiver).toHaveBeenCalledWith(ctx, request);
    await controller.decideWaiver(ctx, 'p'.repeat(24), 'REPORTING_LINE', decision);
    expect(service.decideWaiver).toHaveBeenCalledWith(ctx, 'p'.repeat(24), 'REPORTING_LINE', decision);
  });
});
