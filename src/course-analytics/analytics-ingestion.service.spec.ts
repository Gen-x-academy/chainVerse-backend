import { AnalyticsIngestionService } from './analytics-ingestion.service';

describe('AnalyticsIngestionService', () => {
  let service: AnalyticsIngestionService;
  let learningEventModel: any;
  let save: jest.Mock;

  const dto = {
    eventId: 'event-1',
    eventName: 'lesson.viewed',
    schemaVersion: 1,
    payload: { lessonId: 'lesson-1' },
  };

  beforeEach(() => {
    save = jest.fn().mockResolvedValue({ ...dto });
    learningEventModel = jest.fn().mockImplementation((doc: object) => ({
      ...doc,
      save,
    }));

    service = new AnalyticsIngestionService(learningEventModel);
  });

  it('persists a learning event', async () => {
    const created = await service.create(dto);

    expect(learningEventModel).toHaveBeenCalledWith(dto);
    expect(save).toHaveBeenCalled();
    expect(created).toMatchObject({ eventId: 'event-1' });
  });

  it('propagates persistence errors', async () => {
    save.mockRejectedValue(new Error('write failed'));

    await expect(service.create(dto)).rejects.toThrow('write failed');
  });
});
