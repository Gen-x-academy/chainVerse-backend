import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ConfigureFundingModelDto } from './dto/configure-funding-model.dto';
import { CreateBudgetPlanDto } from './dto/create-budget-plan.dto';
import { ReserveBudgetDto } from './dto/reserve-budget.dto';
import { CreateEscrowIntentDto } from './dto/create-escrow-intent.dto';
import {
  BudgetLineRecord,
  BudgetPlanRecord,
  BudgetReservationRecord,
  EscrowIntentRecord,
  FundingModel,
  FundingModelRecord,
  IdempotencyReceipt,
  PAID_FUNDING_MODELS,
  PROJECT_FUNDING_APPROVER_ROLES,
  PROJECT_FUNDING_WRITE_ROLES,
  ProjectFundingActorContext,
  ProjectFundingRole,
  ReleaseCondition,
} from './entities';
import { ProjectFundingAuditService } from './project-funding-audit.service';
import { ProjectFundingRepository } from './project-funding.repository';
import {
  ConfigureFundingModelResponse,
  CreateBudgetPlanResponse,
  CreateEscrowIntentResponse,
  ReserveBudgetResponse,
} from './responses';

@Injectable()
export class ProjectFundingService {
  constructor(
    private readonly repository: ProjectFundingRepository,
    private readonly audit: ProjectFundingAuditService,
  ) {}

  async configureFundingModel(
    dto: ConfigureFundingModelDto,
    actor: ProjectFundingActorContext,
  ): Promise<ConfigureFundingModelResponse> {
    const id = `model-${dto.projectId}`;

    return this.withIdempotency(
      actor,
      dto.tenantId,
      dto.requestId,
      'project_funding.model.configured',
      id,
      dto,
      () => {
        const existing = this.repository.findModelByProject(
          dto.tenantId,
          dto.projectId,
        );
        this.assertRevision(
          dto.expectedRevision,
          existing?.revision ?? 0,
          'funding model',
        );
        this.assertModelRules(dto);

        const assetCode = dto.asset.code.trim().toUpperCase();
        const record: FundingModelRecord = {
          id,
          tenantId: dto.tenantId,
          projectId: dto.projectId,
          model: dto.model,
          asset: {
            code: assetCode,
            ...(dto.asset.issuer ? { issuer: dto.asset.issuer } : {}),
          },
          payerId: dto.payerId,
          recipients: dto.recipients.map((recipient) => ({ ...recipient })),
          fees: { ...dto.fees },
          committedAmountMinor: dto.committedAmountMinor,
          revision: (existing?.revision ?? 0) + 1,
          createdAt: new Date().toISOString(),
          pool: {
            poolId: `pool-${dto.projectId}`,
            tenantId: dto.tenantId,
            projectId: dto.projectId,
            currency: assetCode,
            capMinor: dto.committedAmountMinor,
            expiresAt: dto.fundingExpiresAt,
          },
        };
        this.repository.saveModel(record);
        return this.toModelResponse(record);
      },
    );
  }

  async createBudgetPlan(
    dto: CreateBudgetPlanDto,
    actor: ProjectFundingActorContext,
  ): Promise<CreateBudgetPlanResponse> {
    const id = `plan-${dto.projectId}`;

    return this.withIdempotency(
      actor,
      dto.tenantId,
      dto.requestId,
      'project_funding.budget_plan.created',
      id,
      dto,
      () => {
        const model = this.repository.findModel(
          dto.tenantId,
          dto.fundingModelId,
        );
        if (!model || model.projectId !== dto.projectId) {
          throw new ResourceNotFoundException(
            'A configured funding model is required for this project',
            ErrorCode.RES_NOT_FOUND,
          );
        }
        const existing = this.repository.findPlan(dto.tenantId, id);
        this.assertRevision(
          dto.expectedRevision,
          existing?.revision ?? 0,
          'budget plan',
        );
        this.assertPlanRules(dto, model, actor);

        const lines: BudgetLineRecord[] = dto.lines.map((line) => ({
          id: line.id,
          category: line.category,
          justification: line.justification,
          quantity: line.quantity,
          unitAmountMinor: line.unitAmountMinor,
          fundingSource: line.fundingSource,
          lineTotalMinor: line.quantity * line.unitAmountMinor,
        }));
        const totalMinor = lines.reduce(
          (sum, line) => sum + line.lineTotalMinor,
          0,
        );
        const byCategory = lines.reduce<Record<string, number>>(
          (result, line) => {
            result[line.category] =
              (result[line.category] ?? 0) + line.lineTotalMinor;
            return result;
          },
          {},
        );

        const record: BudgetPlanRecord = {
          planId: id,
          tenantId: dto.tenantId,
          projectId: dto.projectId,
          fundingModelId: dto.fundingModelId,
          charterId: dto.charterId,
          currency: model.asset.code,
          version: (existing?.version ?? 0) + 1,
          revision: (existing?.revision ?? 0) + 1,
          status: 'approved',
          totalMinor,
          byCategory,
          lines,
          createdAt: new Date().toISOString(),
        };
        this.repository.savePlan(record);
        return this.toPlanResponse(record);
      },
    );
  }

  async reserveBudget(
    dto: ReserveBudgetDto,
    actor: ProjectFundingActorContext,
  ): Promise<ReserveBudgetResponse> {
    const id = `reservation-${dto.requestId}`;

    return this.withIdempotency(
      actor,
      dto.tenantId,
      dto.requestId,
      'project_funding.budget.reserved',
      id,
      dto,
      () => {
        const plan = this.repository.findPlan(dto.tenantId, dto.planId);
        if (!plan || plan.projectId !== dto.projectId) {
          throw new ResourceNotFoundException(
            'The approved budget plan was not found',
            ErrorCode.RES_NOT_FOUND,
          );
        }
        const model = this.repository.findModel(
          dto.tenantId,
          plan.fundingModelId,
        );
        if (!model || model.pool.poolId !== dto.poolId) {
          throw new ResourceNotFoundException(
            'The funding pool for this budget was not found',
            ErrorCode.RES_NOT_FOUND,
          );
        }
        this.assertRevision(dto.expectedRevision, plan.revision, 'budget plan');

        const currency = dto.currency.trim().toUpperCase();
        if (currency !== plan.currency || currency !== model.pool.currency) {
          throw new BusinessRuleException(
            'The reservation currency must match the approved budget and funding pool',
            ErrorCode.BIZ_ASSET_MISMATCH,
            { fields: ['currency'] },
          );
        }
        if (plan.status !== 'approved') {
          throw new BusinessRuleException(
            'Only approved project budgets can be reserved',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
            { fields: ['status'] },
          );
        }
        if (!Number.isSafeInteger(dto.amountMinor) || dto.amountMinor <= 0) {
          throw new ValidationDomainException(
            'The reservation amount must be a positive whole number of minor units',
            ErrorCode.VAL_INVALID_INPUT,
            { fields: ['amountMinor'] },
          );
        }

        const now = Date.now();
        const expiresAt = Date.parse(dto.expiresAt);
        const poolExpiresAt = Date.parse(model.pool.expiresAt);
        if (
          !Number.isFinite(expiresAt) ||
          !Number.isFinite(poolExpiresAt) ||
          expiresAt <= now ||
          expiresAt > poolExpiresAt
        ) {
          throw new BusinessRuleException(
            'The reservation must expire in the future and not outlive its funding pool',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
            { fields: ['expiresAt'] },
          );
        }

        const reservations = this.repository.listReservations(dto.tenantId);
        const poolReserved = reservations
          .filter((item) => item.poolId === model.pool.poolId)
          .reduce((sum, item) => sum + item.amountMinor, 0);
        const planReserved = reservations
          .filter((item) => item.planId === plan.planId)
          .reduce((sum, item) => sum + item.amountMinor, 0);

        if (dto.amountMinor > model.pool.capMinor - poolReserved) {
          throw new BusinessRuleException(
            'The reservation would exceed the funding pool cap',
            ErrorCode.BIZ_BUDGET_INSUFFICIENT,
            { fields: ['amountMinor'] },
          );
        }
        if (dto.amountMinor > plan.totalMinor - planReserved) {
          throw new BusinessRuleException(
            'The reservation would exceed the remaining approved budget',
            ErrorCode.BIZ_BUDGET_INSUFFICIENT,
            { fields: ['amountMinor'] },
          );
        }

        const record: BudgetReservationRecord = {
          reservationId: id,
          tenantId: dto.tenantId,
          projectId: dto.projectId,
          planId: plan.planId,
          poolId: model.pool.poolId,
          amountMinor: dto.amountMinor,
          currency,
          createdAt: new Date().toISOString(),
          expiresAt: dto.expiresAt,
          revision: 1,
        };
        this.repository.saveReservation(record);
        this.repository.savePlan({ ...plan, revision: plan.revision + 1 });
        return this.toReservationResponse(record);
      },
    );
  }

  async createEscrowIntent(
    dto: CreateEscrowIntentDto,
    actor: ProjectFundingActorContext,
  ): Promise<CreateEscrowIntentResponse> {
    const id = `intent-${dto.requestId}`;

    return this.withIdempotency(
      actor,
      dto.tenantId,
      dto.requestId,
      'project_funding.escrow_intent.created',
      id,
      dto,
      () => {
        const plan = this.repository.findPlanByProjectAndCharter(
          dto.tenantId,
          dto.projectId,
          dto.charterId,
        );
        if (!plan || plan.status !== 'approved') {
          throw new ResourceNotFoundException(
            'An approved budget for an accepted charter is required',
            ErrorCode.RES_NOT_FOUND,
          );
        }
        const model = this.repository.findModel(
          dto.tenantId,
          plan.fundingModelId,
        );
        if (!model || dto.payerId !== model.payerId) {
          throw new BusinessRuleException(
            'The payer must match the configured funding model',
            ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
            { fields: ['payerId'] },
          );
        }
        this.assertRevision(dto.expectedRevision, plan.revision, 'budget plan');

        if (!Number.isSafeInteger(dto.amountMinor) || dto.amountMinor <= 0) {
          throw new ValidationDomainException(
            'The intent amount must be a positive whole number of minor units',
            ErrorCode.VAL_INVALID_INPUT,
            { fields: ['amountMinor'] },
          );
        }
        if (String(dto.asset) !== model.asset.code) {
          throw new BusinessRuleException(
            'The escrow asset must match the configured funding asset',
            ErrorCode.BIZ_ASSET_MISMATCH,
            { fields: ['asset'] },
          );
        }
        const currency = dto.currency.trim().toUpperCase();
        if (currency !== plan.currency) {
          throw new BusinessRuleException(
            'The intent currency must match the approved budget',
            ErrorCode.BIZ_ASSET_MISMATCH,
            { fields: ['currency'] },
          );
        }
        const expiresAt = Date.parse(dto.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new BusinessRuleException(
            'The escrow intent must expire in the future',
            ErrorCode.BIZ_INVALID_STATE_TRANSITION,
            { fields: ['expiresAt'] },
          );
        }
        this.assertConditions(dto.conditions);

        const reserved = this.repository
          .listReservations(dto.tenantId)
          .filter((item) => item.planId === plan.planId)
          .reduce((sum, item) => sum + item.amountMinor, 0);
        const alreadyIntended = this.repository
          .listIntents(dto.tenantId)
          .filter((item) => item.charterId === plan.charterId)
          .reduce((sum, item) => sum + item.amountMinor, 0);
        if (dto.amountMinor > plan.totalMinor - reserved - alreadyIntended) {
          throw new BusinessRuleException(
            'The escrow intent would exceed the unreserved approved budget',
            ErrorCode.BIZ_BUDGET_INSUFFICIENT,
            { fields: ['amountMinor'] },
          );
        }

        const record: EscrowIntentRecord = {
          intentId: id,
          tenantId: dto.tenantId,
          projectId: dto.projectId,
          charterId: dto.charterId,
          payerId: dto.payerId,
          amountMinor: dto.amountMinor,
          asset: dto.asset,
          currency,
          createdAt: new Date().toISOString(),
          expiresAt: dto.expiresAt,
          conditions: dto.conditions.map((condition) => ({ ...condition })),
          revision: 1,
        };
        this.repository.saveIntent(record);
        this.repository.savePlan({ ...plan, revision: plan.revision + 1 });
        return this.toIntentResponse(record);
      },
    );
  }

  private withIdempotency<T>(
    actor: ProjectFundingActorContext,
    tenantId: string,
    requestId: string,
    action: string,
    entityId: string,
    payload: unknown,
    mutation: () => T,
  ): Promise<T & { replayed: boolean }> {
    this.assertActor(actor, tenantId);
    const fingerprint = this.fingerprint(action, tenantId, requestId, payload);
    const earlier = this.repository.findReceipt(tenantId, requestId);
    if (earlier) {
      if (earlier.fingerprint !== fingerprint) {
        throw new ResourceConflictException(
          'This idempotency key was already used for a different request',
          ErrorCode.BIZ_IDEMPOTENCY_KEY_REUSED,
        );
      }
      const earlierResult = this.copy(earlier.result as T);
      return { ...earlierResult, replayed: true };
    }

    const result: T & { replayed: boolean } = {
      ...mutation(),
      replayed: false,
    };
    const receipt: IdempotencyReceipt = {
      fingerprint,
      result: this.copy(result),
    };
    this.repository.saveReceipt(tenantId, requestId, receipt);
    this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      tenantId,
      action,
      entityId,
    });
    return this.copy(result);
  }

  private assertActor(
    actor: ProjectFundingActorContext,
    tenantId: string,
  ): void {
    if (!actor || typeof actor.id !== 'string' || actor.id.length === 0) {
      throw new ForbiddenDomainException(
        'An authenticated actor is required',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (
      !PROJECT_FUNDING_WRITE_ROLES.includes(actor.role as ProjectFundingRole)
    ) {
      throw new ForbiddenDomainException(
        'This actor role cannot change project funding',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    if (
      typeof actor.tenantId !== 'string' ||
      actor.tenantId.length === 0 ||
      actor.tenantId !== tenantId
    ) {
      throw new ForbiddenDomainException(
        'The actor cannot act across tenant boundaries',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  private assertRevision(
    expected: number,
    actual: number,
    label: string,
  ): void {
    if (expected !== actual) {
      throw new ResourceConflictException(
        `The ${label} changed (revision ${actual}); reload before retrying`,
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }
  }

  private assertModelRules(dto: ConfigureFundingModelDto): void {
    const assetCode = dto.asset.code.trim().toUpperCase();
    if (assetCode === 'XLM' ? Boolean(dto.asset.issuer) : !dto.asset.issuer) {
      throw new ValidationDomainException(
        'Only XLM is native; every other asset requires an issuer',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['asset.issuer'] },
      );
    }
    if (new Date(dto.fundingExpiresAt).getTime() <= Date.now()) {
      throw new BusinessRuleException(
        'The funding configuration must expire in the future',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
        { fields: ['fundingExpiresAt'] },
      );
    }

    if (dto.model === FundingModel.UNFUNDED) {
      if (dto.committedAmountMinor !== 0 || dto.recipients.length !== 0) {
        throw new BusinessRuleException(
          'An unfunded project cannot commit an amount or name recipients',
          ErrorCode.BIZ_INVALID_STATE_TRANSITION,
          { fields: ['committedAmountMinor', 'recipients'] },
        );
      }
      return;
    }
    if (!PAID_FUNDING_MODELS.includes(dto.model)) {
      throw new ValidationDomainException(
        'Choose a supported funding model',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['model'] },
      );
    }
    if (
      !dto.payerId ||
      dto.committedAmountMinor <= 0 ||
      dto.recipients.length === 0
    ) {
      throw new ValidationDomainException(
        'A funded model requires a payer, a positive amount and at least one recipient',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['payerId', 'committedAmountMinor', 'recipients'] },
      );
    }
    if (
      new Set(dto.recipients.map((recipient) => recipient.memberId)).size !==
      dto.recipients.length
    ) {
      throw new ValidationDomainException(
        'Recipient member ids must be unique',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['recipients'] },
      );
    }
    const shares = dto.recipients.reduce(
      (sum, recipient) => sum + recipient.shareBps,
      0,
    );
    if (shares !== 10000) {
      throw new ValidationDomainException(
        'Recipient shares must add up to 10000 basis points',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['recipients'] },
      );
    }
    const platformFee = Math.floor(
      (dto.committedAmountMinor * dto.fees.platformBps) / 10000,
    );
    if (platformFee + dto.fees.flat >= dto.committedAmountMinor) {
      throw new BusinessRuleException(
        'Fees must leave a positive distributable amount',
        ErrorCode.BIZ_FEE_EXCEEDS_AMOUNT,
        { fields: ['fees'] },
      );
    }
  }

  private assertPlanRules(
    dto: CreateBudgetPlanDto,
    model: FundingModelRecord,
    actor: ProjectFundingActorContext,
  ): void {
    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (seen.has(line.id)) {
        throw new ValidationDomainException(
          'Budget line ids must be unique',
          ErrorCode.VAL_INVALID_INPUT,
          { fields: ['lines'] },
        );
      }
      seen.add(line.id);
      if (
        !Number.isSafeInteger(line.quantity * line.unitAmountMinor) ||
        line.quantity * line.unitAmountMinor <= 0
      ) {
        throw new ValidationDomainException(
          'Every budget line must have a positive whole-unit total',
          ErrorCode.VAL_INVALID_INPUT,
          { fields: ['lines'] },
        );
      }
    }
    const total = dto.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitAmountMinor,
      0,
    );
    if (!Number.isSafeInteger(total) || total <= 0) {
      throw new ValidationDomainException(
        'The budget total must be a positive whole number of minor units',
        ErrorCode.VAL_INVALID_INPUT,
        { fields: ['lines'] },
      );
    }
    if (total > model.committedAmountMinor) {
      throw new BusinessRuleException(
        'The budget plan cannot exceed the configured committed funding',
        ErrorCode.BIZ_BUDGET_INSUFFICIENT,
        { fields: ['lines'] },
      );
    }
    if (total > dto.approvalThresholdMinor) {
      const approved =
        dto.approverId !== undefined &&
        dto.approverRole !== undefined &&
        PROJECT_FUNDING_APPROVER_ROLES.includes(dto.approverRole) &&
        dto.approverId !== actor.id;
      if (!approved) {
        throw new BusinessRuleException(
          'This budget requires approval by an authorised approver',
          ErrorCode.BIZ_OVERRIDE_REQUIRES_APPROVAL,
          { fields: ['approverId', 'approverRole'] },
        );
      }
    }
  }

  private assertConditions(conditions: ReleaseCondition[]): void {
    const seen = new Set<string>();
    for (const condition of conditions) {
      const key = `${condition.type}:${condition.ref}`;
      if (seen.has(key)) {
        throw new ValidationDomainException(
          'Release conditions must be unique',
          ErrorCode.VAL_INVALID_INPUT,
          { fields: ['conditions'] },
        );
      }
      seen.add(key);
    }
  }

  private fingerprint(
    action: string,
    tenantId: string,
    requestId: string,
    payload: unknown,
  ): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ action, tenantId, requestId, payload }))
      .digest('hex');
  }

  private copy<T>(value: T): T {
    return structuredClone(value);
  }

  private toModelResponse(
    record: FundingModelRecord,
  ): ConfigureFundingModelResponse {
    return {
      id: record.id,
      tenantId: record.tenantId,
      projectId: record.projectId,
      model: record.model,
      asset: this.copy(record.asset),
      payerId: record.payerId,
      recipients: this.copy(record.recipients),
      fees: this.copy(record.fees),
      committedAmountMinor: record.committedAmountMinor,
      revision: record.revision,
      createdAt: record.createdAt,
      pool: {
        poolId: record.pool.poolId,
        currency: record.pool.currency,
        capMinor: record.pool.capMinor,
        expiresAt: record.pool.expiresAt,
      },
      replayed: false,
    };
  }

  private toPlanResponse(record: BudgetPlanRecord): CreateBudgetPlanResponse {
    return {
      planId: record.planId,
      tenantId: record.tenantId,
      projectId: record.projectId,
      fundingModelId: record.fundingModelId,
      charterId: record.charterId,
      currency: record.currency,
      version: record.version,
      revision: record.revision,
      totalMinor: record.totalMinor,
      byCategory: this.copy(record.byCategory),
      lines: record.lines.map((line) => ({
        id: line.id,
        category: line.category,
        quantity: line.quantity,
        unitAmountMinor: line.unitAmountMinor,
        fundingSource: line.fundingSource,
        lineTotalMinor: line.lineTotalMinor,
      })),
      createdAt: record.createdAt,
      replayed: false,
    };
  }

  private toReservationResponse(
    record: BudgetReservationRecord,
  ): ReserveBudgetResponse {
    return {
      reservationId: record.reservationId,
      tenantId: record.tenantId,
      projectId: record.projectId,
      planId: record.planId,
      poolId: record.poolId,
      amountMinor: record.amountMinor,
      currency: record.currency,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      revision: record.revision,
      replayed: false,
    };
  }

  private toIntentResponse(
    record: EscrowIntentRecord,
  ): CreateEscrowIntentResponse {
    return {
      intentId: record.intentId,
      tenantId: record.tenantId,
      projectId: record.projectId,
      charterId: record.charterId,
      payerId: record.payerId,
      amountMinor: record.amountMinor,
      asset: record.asset,
      currency: record.currency,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      conditions: this.copy(record.conditions),
      revision: record.revision,
      replayed: false,
    };
  }
}
