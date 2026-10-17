import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationModel: any;
  let paginationService: { paginate: jest.Mock };
  let save: jest.Mock;

  const payload = {
    userId: 'user-1',
    title: 'Welcome',
    message: 'Hello',
    type: 'welcome',
  };

  const executable = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(() => {
    save = jest.fn().mockResolvedValue({ id: 'notification-1' });
    notificationModel = jest.fn().mockImplementation((doc: object) => ({
      ...doc,
      save,
    }));
    notificationModel.findById = jest.fn();
    notificationModel.findByIdAndUpdate = jest.fn();
    notificationModel.findByIdAndDelete = jest.fn();

    paginationService = {
      paginate: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    };

    service = new NotificationService(notificationModel, paginationService);
  });

  it('creates a notification when no preferences are provided', async () => {
    await service.create(payload);

    expect(notificationModel).toHaveBeenCalledWith(payload);
    expect(save).toHaveBeenCalled();
  });

  it('skips a notification when the user opted out', async () => {
    const result = await service.create(
      { ...payload, type: 'marketing' },
      { emailNotifications: false },
    );

    expect(result).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('always sends mandatory notifications despite opt-outs', async () => {
    await service.create(payload, { emailNotifications: false });

    expect(save).toHaveBeenCalled();
  });

  it('paginates all notifications', async () => {
    const dto = { page: 1, limit: 10 };

    await service.findAll(dto as any);

    expect(paginationService.paginate).toHaveBeenCalledWith(
      notificationModel,
      dto,
    );
  });

  it('paginates notifications for a user', async () => {
    const dto = { page: 1, limit: 10 };

    await service.findByUserId('user-1', dto as any);

    expect(paginationService.paginate).toHaveBeenCalledWith(
      notificationModel,
      dto,
      { userId: 'user-1' },
    );
  });

  it('throws NotFoundException when a notification is missing', async () => {
    notificationModel.findById.mockReturnValue(executable(null));

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks a notification as read', async () => {
    notificationModel.findByIdAndUpdate.mockReturnValue(
      executable({ id: 'notification-1', isRead: true }),
    );

    const result = await service.markAsRead('notification-1');

    expect(notificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'notification-1',
      { isRead: true },
      { new: true },
    );
    expect(result.isRead).toBe(true);
  });

  it('throws NotFoundException when deleting a missing notification', async () => {
    notificationModel.findByIdAndDelete.mockReturnValue(executable(null));

    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
