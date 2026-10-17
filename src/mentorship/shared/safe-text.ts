import { ErrorCode } from '../../common/errors';
import { MentorshipValidationException } from './joi-validation.pipe';

/**
 * Builder-supplied text (labels, help text, eligibility messages) is stored
 * and rendered as plain text. Anything that looks like markup or a script
 * vector is rejected up-front rather than sanitised, so stored content is
 * byte-for-byte what the owner typed and is safe in every client.
 */
const UNSAFE_PATTERNS: Array<{ re: RegExp; issue: string }> = [
  { re: /<\s*\/?\s*[a-z!?][^>]*>/i, issue: 'HTML/XML tags are not allowed' },
  { re: /[<>]/, issue: 'angle brackets are not allowed' },
  { re: /javascript\s*:/i, issue: 'javascript: URLs are not allowed' },
  { re: /data\s*:\s*text\/html/i, issue: 'data:text/html URLs are not allowed' },
  { re: /\bon[a-z]+\s*=/i, issue: 'inline event handlers are not allowed' },
  { re: /\{\{|\}\}|\$\{/, issue: 'template expressions are not allowed' },
  // eslint-disable-next-line no-control-regex
  { re: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/, issue: 'control or bidi-override characters are not allowed' },
];

export function findUnsafeMarkup(value: string): string | null {
  for (const { re, issue } of UNSAFE_PATTERNS) {
    if (re.test(value)) return issue;
  }
  return null;
}

/** Collects unsafe-markup problems for many fields and throws once. */
export function assertSafeText(fields: Array<{ field: string; value: string | undefined | null }>): void {
  const details = fields
    .filter((f): f is { field: string; value: string } => typeof f.value === 'string')
    .map((f) => ({ field: f.field, issue: findUnsafeMarkup(f.value) }))
    .filter((f): f is { field: string; issue: string } => f.issue !== null);

  if (details.length > 0) {
    throw new MentorshipValidationException(
      'Text fields must be plain text without markup',
      details,
      ErrorCode.MENTOR_UNSAFE_MARKUP,
    );
  }
}

/**
 * Remediation links must be https URLs or same-origin absolute paths.
 * Protocol-relative (`//host`) and other schemes are rejected.
 */
export function isSafeLink(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return !/[\s<>"']/.test(value);
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
