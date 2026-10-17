import { NotFoundException } from '@nestjs/common';
import { SubscriptionPlanService } from './subscription-plan.service';

describe('SubscriptionPlanService', () => {
  let service: SubscriptionPlanService;
  let planModel: any;
  let save: jest.Mock;

  const payload = {
    name: 'Pro',
    description: 'Pro plan',
    price: 10,
    duration: 30,
    features: ['courses', 'certificates'],
  };

  const executable = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(() => {
    save = jest.fn().mockImplementation(async function (this: unknown) {
      return this;
    });
    planModel = jest.fn().mockImplementation((doc: object) => ({
      ...doc,
      save,
    }));
    planModel.find = jest.fn();
    planModel.findById = jest.fn();
    planModel.findByIdAndUpdate = jest.fn();
    planModel.findByIdAndDelete = jest.fn();

    service = new SubscriptionPlanService(planModel);
  });

  it('creates a subscription plan', async () => {
    const created = await service.create(payload);

    expect(planModel).toHaveBeenCalledWith(payload);
    expect(save).toHaveBeenCalled();
    expect(created).toMatchObject(payload);
  });

  it('lists subscription plans', async () => {
    planModel.find.mockReturnValue(executable([{ name: 'Pro' }]));

    await expect(service.findAll()).resolves.toHaveLength(1);
  });

  it('returns a plan by id', async () => {
    planModel.findById.mockReturnValue(executable({ name: 'Pro' }));

    await expect(service.findOne('plan-1')).resolves.toEqual({ name: 'Pro' });
  });

  it('throws NotFoundException when the plan does not exist', async () => {
    planModel.findById.mockReturnValue(executable(null));

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a plan', async () => {
    planModel.findByIdAndUpdate.mockReturnValue(
      executable({ name: 'Pro', price: 20 }),
    );

    await expect(service.update('plan-1', { price: 20 })).resolves.toEqual({
      name: 'Pro',
      price: 20,
    });
  });

  it('throws NotFoundException when updating a missing plan', async () => {
    planModel.findByIdAndUpdate.mockReturnValue(executable(null));

    await expect(service.update('missing', { price: 20 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes a plan', async () => {
    planModel.findByIdAndDelete.mockReturnValue(executable({ name: 'Pro' }));

    await expect(service.remove('plan-1')).resolves.toEqual({
      id: 'plan-1',
      deleted: true,
    });
  });

  it('throws NotFoundException when deleting a missing plan', async () => {
    planModel.findByIdAndDelete.mockReturnValue(executable(null));

    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
