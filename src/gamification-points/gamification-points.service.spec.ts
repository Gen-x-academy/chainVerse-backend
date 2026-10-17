import { NotFoundException } from '@nestjs/common';
import { GamificationPointsService } from './gamification-points.service';

describe('GamificationPointsService', () => {
  let service: GamificationPointsService;

  const payload = {
    title: 'Lesson completed',
    description: 'Points for finishing a lesson',
    metadata: { points: 10 },
  };

  beforeEach(() => {
    service = new GamificationPointsService();
  });

  it('creates and lists point records', () => {
    const created = service.create(payload);

    expect(created.id).toBeDefined();
    expect(created.metadata).toEqual({ points: 10 });
    expect(service.findAll()).toEqual([created]);
  });

  it('finds a point record by id', () => {
    const created = service.create(payload);

    expect(service.findOne(created.id)).toBe(created);
  });

  it('throws NotFoundException for an unknown record', () => {
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
  });

  it('updates an existing record', () => {
    const created = service.create(payload);

    const updated = service.update(created.id, { title: 'Quiz completed' });

    expect(updated.title).toBe('Quiz completed');
  });

  it('removes an existing record', () => {
    const created = service.create(payload);

    expect(service.remove(created.id)).toEqual({
      id: created.id,
      deleted: true,
    });
    expect(service.findAll()).toHaveLength(0);
  });

  it('throws NotFoundException when removing an unknown record', () => {
    expect(() => service.remove('missing')).toThrow(NotFoundException);
  });
});
