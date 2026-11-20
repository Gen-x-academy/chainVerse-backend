import { ApiProperty } from '@nestjs/swagger';
import {
  BudgetCategory,
  EscrowAsset,
  FundingModel,
  ReleaseConditionType,
} from './entities';

export class FundingAssetResponse {
  @ApiProperty() code: string;
  @ApiProperty({ required: false }) issuer?: string;
}

export class FundingRecipientResponse {
  @ApiProperty() memberId: string;
  @ApiProperty() shareBps: number;
}

export class FundingFeesResponse {
  @ApiProperty() platformBps: number;
  @ApiProperty() flat: number;
}

export class FundingPoolResponse {
  @ApiProperty() poolId: string;
  @ApiProperty() currency: string;
  @ApiProperty() capMinor: number;
  @ApiProperty() expiresAt: string;
}

export class ConfigureFundingModelResponse {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() projectId: string;
  @ApiProperty({ enum: FundingModel }) model: FundingModel;
  @ApiProperty({ type: FundingAssetResponse }) asset: FundingAssetResponse;
  @ApiProperty() payerId: string;
  @ApiProperty({ type: [FundingRecipientResponse] })
  recipients: FundingRecipientResponse[];
  @ApiProperty({ type: FundingFeesResponse }) fees: FundingFeesResponse;
  @ApiProperty() committedAmountMinor: number;
  @ApiProperty() revision: number;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: FundingPoolResponse }) pool: FundingPoolResponse;
  @ApiProperty() replayed: boolean;
}

export class PublicBudgetLineResponse {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BudgetCategory }) category: BudgetCategory;
  @ApiProperty() quantity: number;
  @ApiProperty() unitAmountMinor: number;
  @ApiProperty() fundingSource: string;
  @ApiProperty() lineTotalMinor: number;
}

export class CreateBudgetPlanResponse {
  @ApiProperty() planId: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() fundingModelId: string;
  @ApiProperty() charterId: string;
  @ApiProperty() currency: string;
  @ApiProperty() version: number;
  @ApiProperty() revision: number;
  @ApiProperty() totalMinor: number;
  @ApiProperty() byCategory: Record<string, number>;
  @ApiProperty({ type: [PublicBudgetLineResponse] })
  lines: PublicBudgetLineResponse[];
  @ApiProperty() createdAt: string;
  @ApiProperty() replayed: boolean;
}

export class ReserveBudgetResponse {
  @ApiProperty() reservationId: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() planId: string;
  @ApiProperty() poolId: string;
  @ApiProperty() amountMinor: number;
  @ApiProperty() currency: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() expiresAt: string;
  @ApiProperty() revision: number;
  @ApiProperty() replayed: boolean;
}

export class ReleaseConditionResponse {
  @ApiProperty({ enum: ReleaseConditionType }) type: ReleaseConditionType;
  @ApiProperty() ref: string;
}

export class CreateEscrowIntentResponse {
  @ApiProperty() intentId: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() projectId: string;
  @ApiProperty() charterId: string;
  @ApiProperty() payerId: string;
  @ApiProperty() amountMinor: number;
  @ApiProperty({ enum: EscrowAsset }) asset: EscrowAsset;
  @ApiProperty() currency: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() expiresAt: string;
  @ApiProperty({ type: [ReleaseConditionResponse] })
  conditions: ReleaseConditionResponse[];
  @ApiProperty() revision: number;
  @ApiProperty() replayed: boolean;
}
