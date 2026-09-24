export type PayoutFailureCategory =
  | 'missing_trustline'
  | 'bad_destination'
  | 'insufficient_funds'
  | 'network_expiry'
  | 'transient'
  | 'unknown';

export interface PayoutFailureDiagnosis {
  category: PayoutFailureCategory;
  /** Whether a new attempt may be created for this intent. */
  retryable: boolean;
  /** Whether the retry job may create the next attempt without an operator. */
  autoRetry: boolean;
  /** What an operator (or the recipient) must do before retrying. */
  operatorAction: string;
  message: string;
  transactionCode?: string;
  operationCodes: string[];
}

export interface StellarResultCodes {
  transaction?: string;
  operations?: string[];
}

/**
 * Maps Horizon `result_codes` (plus signer-side error strings) onto an
 * actionable failure category.
 *
 * Reference: https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/result-codes
 */
export function classifyPayoutFailure(
  codes: StellarResultCodes = {},
  signerError?: string,
): PayoutFailureDiagnosis {
  const tx = codes.transaction;
  const ops = codes.operations ?? [];
  const has = (...wanted: string[]) =>
    ops.some((c) => wanted.includes(c)) ||
    (tx !== undefined && wanted.includes(tx));
  const base = { transactionCode: tx, operationCodes: ops };

  if (has('op_no_trust', 'op_not_authorized', 'op_line_full')) {
    return {
      ...base,
      category: 'missing_trustline',
      retryable: true,
      autoRetry: false,
      operatorAction:
        'Ask the recipient to add (or authorize) a trustline for the program asset with enough limit, then retry.',
      message: 'The destination account cannot hold the program asset.',
    };
  }
  if (
    has('op_no_destination', 'op_malformed') ||
    /destination/i.test(signerError ?? '')
  ) {
    return {
      ...base,
      category: 'bad_destination',
      retryable: true,
      autoRetry: false,
      operatorAction:
        'Confirm the recipient’s Stellar address (account must exist and be funded) and retry with a corrected destination.',
      message: 'The destination account does not exist or is invalid.',
    };
  }
  if (
    has(
      'op_underfunded',
      'op_src_no_trust',
      'op_src_not_authorized',
      'tx_insufficient_balance',
      'tx_insufficient_fee',
    )
  ) {
    return {
      ...base,
      category: 'insufficient_funds',
      retryable: true,
      autoRetry: false,
      operatorAction:
        'Top up the program treasury (asset and XLM for fees/reserve), run a reconciliation, then retry.',
      message:
        'The treasury account lacks the balance or fees to pay this installment.',
    };
  }
  if (
    has('tx_too_late', 'tx_too_early') ||
    /timeout|expired/i.test(signerError ?? '')
  ) {
    return {
      ...base,
      category: 'network_expiry',
      retryable: true,
      autoRetry: true,
      operatorAction: 'None — a fresh envelope is created automatically.',
      message:
        'The transaction envelope expired before it was included in a ledger.',
    };
  }
  if (
    has('tx_bad_seq', 'tx_internal_error') ||
    /ECONN|503|504|rate/i.test(signerError ?? '')
  ) {
    return {
      ...base,
      category: 'transient',
      retryable: true,
      autoRetry: true,
      operatorAction: 'None — retried automatically with backoff.',
      message: 'A transient network or sequencing error occurred.',
    };
  }
  return {
    ...base,
    category: 'unknown',
    retryable: true,
    autoRetry: false,
    operatorAction:
      'Inspect the result codes and signer error, resolve the cause, then retry manually.',
    message: signerError
      ? `Unclassified failure: ${signerError}`
      : 'Unclassified payout failure.',
  };
}
