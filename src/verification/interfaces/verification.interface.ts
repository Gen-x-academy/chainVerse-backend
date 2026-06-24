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
  ticket?: {
    id: string;
    qrCode: string;
    ticketType: string;
    attendeeName: string;
    eventId: string;
    event?: {
      id: string;
      name: string;
      eventDate: Date;
      eventClosingDate: Date;
    };
  };
  verifiedAt: Date;
  verifiedBy: string;
  deviceInfo?: any;
}

export interface VerificationRequest {
  ticketCode: string;
  ticketId: string | null;
  requestEventId: string;
  status: VerificationStatus;
  verifierId?: string;
}

export interface VerificationLog {
  id: string;
  ticketCode: string;
  ticketId: string | null;
  eventId: string;
  status: VerificationStatus;
  verifierId?: string;
  verifiedAt: Date;
  deviceInfo?: any;
}

export interface VerificationStats {
  totalTickets: number;
  verifiedTickets: number;
  remainingTickets: number;
  verificationRate: number;
}
