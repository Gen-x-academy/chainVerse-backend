export enum VerificationStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
  ALREADY_USED = 'ALREADY_USED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  EVENT_NOT_STARTED = 'EVENT_NOT_STARTED',
  EVENT_ENDED = 'EVENT_ENDED',
}

export interface VerificationResult {
  status: VerificationStatus;
  isValid: boolean;
  message: string;
  ticketCode?: string;
  eventId?: string;
  verifiedAt: Date;
  verifiedBy: string | null;
}

export interface VerificationRequest {
  ticketCode: string;
  eventId?: string;
  verifierId?: string;
  markAsUsed?: boolean;
}

export interface VerificationLog {
  id: string;
  ticketCode: string;
  ticketId: string | null;
  eventId: string;
  status: VerificationStatus;
  verifierId: string | null;
  message: string;
  createdAt: Date;
}

export interface VerificationStats {
  eventId: string;
  total: number;
  valid: number;
  invalid: number;
  alreadyUsed: number;
  byStatus: Record<VerificationStatus, number>;
}
