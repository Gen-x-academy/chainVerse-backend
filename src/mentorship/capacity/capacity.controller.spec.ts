import { Role } from '../../common/enums/role.enum';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { CapacityAccessPolicy } from './capacity-access.policy';
import { CapacityController } from './capacity.controller';
import { CapacityService } from './capacity.service';
import { DefineCapacityPolicyDto, ReserveCapacityDto } from './dto/capacity.dto';

const ctx: MentorshipRequestContext = {
  user: { id: 'admin-001', email: 'admin@example.com', role: Role.ADMIN },
};

function build() {
  const service = {
    definePolicy: jest.fn().mockResolvedValue({ version: 1 }),
    inspectAllocation: jest.fn().mockResolvedValue({ calculation: { canAcceptOneMore: true } }),
    reserveCapacity: jest.fn().mockResolvedValue({ status: 'active' }),
    releaseCapacity: jest.fn().mockResolvedValue({ status: 'released' }),
    expireReservations: jest.fn().mockResolvedValue({ scanned: 0, expired: 0 }),
  } as unknown as CapacityService;
  const access = {
    assertCanSweep: jest.fn(),
    isCoordinator: jest.fn().mockReturnValue(true),
    deny: jest.fn(),
  } as unknown as CapacityAccessPolicy;
  return { controller: new CapacityController(service, access), service, access };
}

describe('CapacityController (MENTOR-041)', () => {
  it('is protected by the JWT guard', () => {
    expect(Reflect.getMetadata('__guards__', CapacityController)).toHaveLength(1);
  });

  it('delegates policy definition with the request context', async () => {
    const { controller, service } = build();
    const dto = { scope: 'global' } as unknown as DefineCapacityPolicyDto;
    await expect(controller.definePolicy(ctx, dto)).resolves.toEqual({ version: 1 });
    expect(service.definePolicy).toHaveBeenCalledWith(ctx, dto);
  });

  it('delegates read-only inspection', async () => {
    const { controller, service } = build();
    await controller.inspect(ctx, 'm'.repeat(24), {});
    expect(service.inspectAllocation).toHaveBeenCalledWith(ctx, 'm'.repeat(24), {});
  });

  it('delegates reservation and release', async () => {
    const { controller, service } = build();
    const dto = { proposalId: 'p'.repeat(24) } as unknown as ReserveCapacityDto;
    await controller.reserve(ctx, dto);
    expect(service.reserveCapacity).toHaveBeenCalledWith(ctx, dto);
    await controller.release(ctx, 'p'.repeat(24), 'm'.repeat(24));
    expect(service.releaseCapacity).toHaveBeenCalledWith(ctx, 'm'.repeat(24), 'p'.repeat(24));
  });

  it('enforces staff-only sweeping before delegating', async () => {
    const { controller, service, access } = build();
    await controller.sweep(ctx, { limit: 10 });
    expect(access.assertCanSweep).toHaveBeenCalledWith(ctx.user);
    expect(service.expireReservations).toHaveBeenCalledWith({ limit: 10 });
  });
});
