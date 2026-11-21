import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CloseProjectDto,
  ProjectClosureConsentDto,
} from './project-workspace.dto';

describe('project closure DTOs', () => {
  it('accepts supported closure reasons and bounded idempotency keys', async () => {
    const dto = plainToInstance(CloseProjectDto, {
      reason: 'successful_completion',
      expectedVersion: 1,
      idempotencyKey: 'close-project-1',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects system-only closure reasons and malformed consent requests', async () => {
    const closeDto = plainToInstance(CloseProjectDto, {
      reason: 'inactivity',
      expectedVersion: 1,
      idempotencyKey: 'close-project-1',
    });
    const consentDto = plainToInstance(ProjectClosureConsentDto, {
      decision: 'reject',
      expectedVersion: 0,
      idempotencyKey: 'bad',
    });

    expect(await validate(closeDto)).not.toHaveLength(0);
    expect(await validate(consentDto)).not.toHaveLength(0);
  });
});
