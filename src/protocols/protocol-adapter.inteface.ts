export interface PositionData {
  token: string;
  balance: number;
  valueUSD: number;
  apy: number;
  rewards: RewardData[];
}

export interface TransactionData {
  to: string;
  from: string;
  value: string;
  data: string;
}

export interface CollateralData {
  totalCollateral: number;
  totalBorrowed: number;
  availableToBorrow: number;
  ltv: number;
  maxLtv: number;
  liquidationThreshold: number;
  healthFactor: number;
  collateralBreakdown: any[];
}

export interface RewardData {
  token: string;
  amount: number;
  valueUSD: number;
  apy: number;
  claimable: boolean;
}

export interface ProtocolMetrics {
  tvl: number;
  apy: number;
  users: number;
  audits: string[];
  insurance: boolean;
}

export interface RiskMetrics {
  smartContractRisk: number;
  liquidationRisk: number;
  counterpartyRisk: number;
  priceVolatilityRisk: number;
  composabilityRisk: number;
}

export interface GasEstimate {
  gas: number;
  gasPrice: string;
  totalCost: string;
  costUSD: number;
}

export interface SimulationResult {
  success: boolean;
  slippage?: number;
  error?: string;
}

export interface ProtocolAdapter {
  name: string;
  supportedChains: string[];
  getPosition(address: string, token: string, chain?: string): Promise<PositionData>;
  getAllPositions(address: string, chain?: string): Promise<PositionData[]>;
  deposit(address: string, token: string, amount: number, chain?: string): Promise<TransactionData>;
  withdraw(address: string, token: string, amount: number, chain?: string): Promise<TransactionData>;
  borrow(address: string, token: string, amount: number, chain?: string): Promise<TransactionData>;
  repay(address: string, token: string, amount: number, chain?: string): Promise<TransactionData>;
  getCollateralData(address: string, chain?: string): Promise<CollateralData>;
  getRewards(addresses: string[], user: string, chain?: string): Promise<RewardData[]>;
  claimRewards(address: string, token?: string, chain?: string): Promise<TransactionData>;
  getAPY(token: string, chain?: string): Promise<number>;
  getTVL(): Promise<number>;
  getProtocolMetrics(): Promise<ProtocolMetrics>;
  getRiskMetrics(address: string, token: string, chain?: string): Promise<RiskMetrics>;
  estimateGas(tx: TransactionData): Promise<GasEstimate>;
  simulateTransaction(tx: TransactionData): Promise<SimulationResult>;
}
