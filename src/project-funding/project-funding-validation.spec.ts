import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ConfigureFundingModelDto } from './dto/configure-funding-model.dto';
import { CreateBudgetPlanDto } from './dto/create-budget-plan.dto';
import { ReserveBudgetDto } from './dto/reserve-budget.dto';
import { CreateEscrowIntentDto } from './dto/create-escrow-intent.dto';
import {
  modelDto,
  planDto,
  reservationDto,
  intentDto,
} from './project-funding.fixtures';

describe('project funding DTO validation', () => {
  const validateDto = async (instance: object) => validate(instance);
  const collect = (errors: ValidationError[]): string[] =>
    errors.flatMap((error) => [
      ...Object.keys(error.constraints ?? {}),
      ...collect(error.children ?? []),
    ]);
  const fields = async (instance: object) =>
    collect(await validateDto(instance));

  it('accepts valid requests for all four operations', async () => {
    expect(
      await validateDto(plainToInstance(ConfigureFundingModelDto, modelDto())),
    ).toEqual([]);
    expect(
      await validateDto(plainToInstance(CreateBudgetPlanDto, planDto())),
    ).toEqual([]);
    expect(
      await validateDto(plainToInstance(ReserveBudgetDto, reservationDto())),
    ).toEqual([]);
    expect(
      await validateDto(plainToInstance(CreateEscrowIntentDto, intentDto())),
    ).toEqual([]);
  });

  it('rejects malformed funding model configuration', async () => {
    const dto = plainToInstance(ConfigureFundingModelDto, {
      ...modelDto(),
      requestId: 'bad id',
      model: 'unknown',
      committedAmountMinor: -1,
      asset: { code: 'BAD CODE' },
      recipients: [{ memberId: '', shareBps: 20000 }],
      fees: { platformBps: 2000, flat: -5 },
      fundingExpiresAt: 'not-a-date',
    });

    const errors = await fields(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('isEnum');
  });

  it('rejects malformed budget plans', async () => {
    const dto = plainToInstance(CreateBudgetPlanDto, {
      ...planDto(),
      lines: [
        {
          id: 'line-1',
          category: 'unknown',
          justification: '',
          quantity: 0,
          unitAmountMinor: -1,
          fundingSource: '',
        },
      ],
      approvalThresholdMinor: -1,
      approverRole: 'sponsor',
    });

    const errors = await fields(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('isEnum');
  });

  it('rejects malformed reservations', async () => {
    const dto = plainToInstance(ReserveBudgetDto, {
      ...reservationDto(),
      amountMinor: 0,
      currency: 'usd',
      expectedRevision: -1,
      expiresAt: 'yesterday',
    });

    const errors = await fields(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('matches');
  });

  it('rejects malformed escrow intents', async () => {
    const dto = plainToInstance(CreateEscrowIntentDto, {
      ...intentDto(),
      amountMinor: -10,
      asset: 'BTC',
      currency: 'dollars',
      conditions: [{ type: 'unknown', ref: '' }],
      expiresAt: 'never',
    });

    const errors = await fields(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('isEnum');
  });

  it('requires at least one budget line and one release condition', async () => {
    expect(
      await fields(
        plainToInstance(CreateBudgetPlanDto, { ...planDto(), lines: [] }),
      ),
    ).toContain('arrayNotEmpty');
    expect(
      await fields(
        plainToInstance(CreateEscrowIntentDto, {
          ...intentDto(),
          conditions: [],
        }),
      ),
    ).toContain('arrayNotEmpty');
  });
});
