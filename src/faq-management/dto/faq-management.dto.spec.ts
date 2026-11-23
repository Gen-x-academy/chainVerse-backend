import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFaqManagementDto } from './create-faq-management.dto';

describe('CreateFaqManagementDto validation', () => {
  it('rejects an invalid payload', async () => {
    const dto = plainToInstance(CreateFaqManagementDto, {
      title: '',
      description: 123,
      metadata: 'not-an-object',
    });

    const errors = await validate(dto as object);
    const properties = errors.map((e) => e.property);

    expect(errors.length).toBeGreaterThan(0);
    expect(properties).toEqual(
      expect.arrayContaining(['title', 'description', 'metadata']),
    );
  });
});
