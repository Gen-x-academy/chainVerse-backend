/**
 * Redaction helpers for audit metadata.
 *
 * Audit entries carry before/after snapshots of privileged mutations, so they
 * are a prime target for credential and PII leakage. Everything written to the
 * audit collection passes through {@link redactMetadata} first.
 */

/** Key names (case-insensitive substring match) whose values are never stored. */
export const SENSITIVE_KEY_PATTERNS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'accesskey',
  'privatekey',
  'credential',
  'sessionid',
  'cookie',
  'otp',
  'pin',
  'cvv',
  'cardnumber',
  'card_number',
  'ssn',
  'taxid',
  'seed',
  'mnemonic',
];

export const REDACTED = '[REDACTED]';
export const TRUNCATED_SUFFIX = '…[truncated]';

export interface RedactionOptions {
  /** Maximum object/array nesting before the branch is collapsed. */
  maxDepth?: number;
  /** Maximum number of array entries retained. */
  maxArrayLength?: number;
  /** Maximum string length retained before truncation. */
  maxStringLength?: number;
  /** Maximum number of keys retained per object. */
  maxKeys?: number;
}

const DEFAULTS: Required<RedactionOptions> = {
  maxDepth: 5,
  maxArrayLength: 20,
  maxStringLength: 512,
  maxKeys: 50,
};

/** Lower-cases and drops separators so `card_number`, `card-number` and
 * `cardNumber` all normalise to the same comparable form. */
const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[-_\s]/g, '');

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalized.includes(normalizeKey(pattern)),
  );
}

/**
 * Masks an email so an auditor can still correlate accounts without the
 * collection becoming a harvestable address list: `ada@example.com` → `a***@example.com`.
 */
export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  const head = local[0];
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Recursively copies `value` into a plain, storage-safe structure with
 * sensitive keys removed, oversized strings truncated and cycles broken.
 */
export function redactMetadata(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  const opts = { ...DEFAULTS, ...options };
  return walk(value, opts, 0, new WeakSet<object>());
}

function walk(
  value: unknown,
  opts: Required<RedactionOptions>,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return null;

  const type = typeof value;

  if (type === 'string') {
    const str = value as string;
    if (EMAIL_RE.test(str)) return maskEmail(str);
    return str.length > opts.maxStringLength
      ? str.slice(0, opts.maxStringLength) + TRUNCATED_SUFFIX
      : str;
  }

  if (type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return (value as bigint).toString();
  if (type === 'function' || type === 'symbol') return '[unsupported]';

  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;

  // Mongoose documents / ObjectIds expose their own serialisation
  const obj = value as Record<string, unknown>;
  if (typeof obj.toHexString === 'function') {
    return (obj.toHexString as () => string)();
  }
  if (typeof obj.toObject === 'function') {
    return walk((obj.toObject as () => unknown)(), opts, depth, seen);
  }

  if (seen.has(value)) return '[circular]';
  if (depth >= opts.maxDepth) return '[depth-limit]';
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const kept = value.slice(0, opts.maxArrayLength);
      const out: unknown[] = kept.map((entry) =>
        walk(entry, opts, depth + 1, seen),
      );
      if (value.length > opts.maxArrayLength) {
        out.push(`[+${value.length - opts.maxArrayLength} more]`);
      }
      return out;
    }

    const entries = Object.entries(obj).filter(
      ([, entryValue]) => typeof entryValue !== 'undefined',
    );
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of entries.slice(0, opts.maxKeys)) {
      result[key] = isSensitiveKey(key)
        ? REDACTED
        : walk(entryValue, opts, depth + 1, seen);
    }
    if (entries.length > opts.maxKeys) {
      result['__truncatedKeys'] = entries.length - opts.maxKeys;
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

/**
 * Picks a stable subset of fields from a document for before/after snapshots.
 * Keeping snapshots narrow limits both storage growth and leak surface.
 */
export function snapshot<T extends object>(
  source: T | null | undefined,
  fields: readonly string[],
): Record<string, unknown> | null {
  if (!source) return null;
  const plain =
    typeof (source as { toObject?: () => T }).toObject === 'function'
      ? (source as { toObject: () => T }).toObject()
      : source;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (plain as Record<string, unknown>)[field];
    if (typeof value !== 'undefined') out[field] = value;
  }
  return redactMetadata(out) as Record<string, unknown>;
}
