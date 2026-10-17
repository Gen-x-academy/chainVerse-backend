import { NotFoundException } from '@nestjs/common';
import { AdminModeratorAccountSettingsService } from './admin-moderator-account-settings.service';

describe('AdminModeratorAccountSettingsService', () => {
  let service: AdminModeratorAccountSettingsService;

  const payload = {
    title: 'Account settings',
    description: 'Default settings for moderators',
  };

  beforeEach(() => {
    service = new AdminModeratorAccountSettingsService();
  });

  it('creates and lists settings', () => {
    const created = service.create(payload);

    expect(created.id).toBeDefined();
    expect(created.title).toBe(payload.title);
    expect(service.findAll()).toEqual([created]);
  });

  it('finds a setting by id', () => {
    const created = service.create(payload);

    expect(service.findOne(created.id)).toBe(created);
  });

  it('throws NotFoundException for an unknown setting', () => {
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
  });

  it('updates an existing setting', () => {
    const created = service.create(payload);

    const updated = service.update(created.id, { title: 'Updated' });

    expect(updated.title).toBe('Updated');
    expect(service.findOne(created.id).title).toBe('Updated');
  });

  it('removes an existing setting', () => {
    const created = service.create(payload);

    expect(service.remove(created.id)).toEqual({
      id: created.id,
      deleted: true,
    });
    expect(service.findAll()).toHaveLength(0);
  });

  it('throws NotFoundException when removing an unknown setting', () => {
    expect(() => service.remove('missing')).toThrow(NotFoundException);
  });
});
