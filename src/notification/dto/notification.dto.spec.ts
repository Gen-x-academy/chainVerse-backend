import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateNotificationDto } from './create-notification.dto';

describe('CreateNotificationDto validation', () => {
  it('rejects an invalid payload', async () => {
    const dto = plainToInstance(CreateNotificationDto, {
      userId: '',
      title: 123,
      message: null,
      type: 42,
      metadata: 'not-an-object',
    });

    const errors = await validate(dto as object);
    const properties = errors.map((e) => e.property);

    expect(errors.length).toBeGreaterThan(0);
    expect(properties).toEqual(
      expect.arrayContaining([
        'userId',
        'title',
        'message',
        'type',
        'metadata',
      ]),
    );
  });
});
