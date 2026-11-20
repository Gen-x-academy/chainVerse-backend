import { Injectable } from '@nestjs/common';
import {
  BudgetPlanRecord,
  BudgetReservationRecord,
  EscrowIntentRecord,
  FundingModelRecord,
  IdempotencyReceipt,
} from './entities';

@Injectable()
export class ProjectFundingRepository {
  private readonly models = new Map<string, Map<string, FundingModelRecord>>();
  private readonly plans = new Map<string, Map<string, BudgetPlanRecord>>();
  private readonly reservations = new Map<
    string,
    Map<string, BudgetReservationRecord>
  >();
  private readonly intents = new Map<string, Map<string, EscrowIntentRecord>>();
  private readonly receipts = new Map<
    string,
    Map<string, IdempotencyReceipt>
  >();

  saveModel(model: FundingModelRecord): void {
    this.put(this.models, model.tenantId, model.id, model);
  }

  findModel(tenantId: string, modelId: string): FundingModelRecord | undefined {
    return this.copy(this.get(this.models, tenantId, modelId));
  }

  findModelByProject(
    tenantId: string,
    projectId: string,
  ): FundingModelRecord | undefined {
    return this.copy(
      [...(this.models.get(tenantId)?.values() ?? [])].find(
        (model) => model.projectId === projectId,
      ),
    );
  }

  savePlan(plan: BudgetPlanRecord): void {
    this.put(this.plans, plan.tenantId, plan.planId, plan);
  }

  findPlan(tenantId: string, planId: string): BudgetPlanRecord | undefined {
    return this.copy(this.get(this.plans, tenantId, planId));
  }

  findPlanByProjectAndCharter(
    tenantId: string,
    projectId: string,
    charterId: string,
  ): BudgetPlanRecord | undefined {
    return this.copy(
      [...(this.plans.get(tenantId)?.values() ?? [])].find(
        (plan) => plan.projectId === projectId && plan.charterId === charterId,
      ),
    );
  }

  saveReservation(reservation: BudgetReservationRecord): void {
    this.put(
      this.reservations,
      reservation.tenantId,
      reservation.reservationId,
      reservation,
    );
  }

  listReservations(tenantId: string): BudgetReservationRecord[] {
    return [...(this.reservations.get(tenantId)?.values() ?? [])].map((item) =>
      this.copy(item),
    );
  }

  saveIntent(intent: EscrowIntentRecord): void {
    this.put(this.intents, intent.tenantId, intent.intentId, intent);
  }

  listIntents(tenantId: string): EscrowIntentRecord[] {
    return [...(this.intents.get(tenantId)?.values() ?? [])].map((item) =>
      this.copy(item),
    );
  }

  findReceipt(
    tenantId: string,
    requestId: string,
  ): IdempotencyReceipt | undefined {
    return this.copy(this.get(this.receipts, tenantId, requestId));
  }

  saveReceipt(
    tenantId: string,
    requestId: string,
    receipt: IdempotencyReceipt,
  ): void {
    this.put(this.receipts, tenantId, requestId, receipt);
  }

  private put<T extends { tenantId: string }>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    key: string,
    value: T,
  ): void {
    const tenantStore = store.get(tenantId) ?? new Map<string, T>();
    tenantStore.set(key, this.copy(value));
    store.set(tenantId, tenantStore);
  }

  private get<T>(
    store: Map<string, Map<string, T>>,
    tenantId: string,
    key: string,
  ): T | undefined {
    return store.get(tenantId)?.get(key);
  }

  private copy<T>(value: T | undefined): T | undefined {
    return value === undefined ? undefined : structuredClone(value);
  }
}
