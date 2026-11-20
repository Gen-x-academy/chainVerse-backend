import { ValidationDomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const MAX_SOURCE_LENGTH = 20_000;
const UNSAFE_TAG =
  /<\s*\/?\s*(script|iframe|object|embed|style|link|svg|img|form|meta|base)\b/i;
const UNSAFE_URL = /\b(?:javascript|data|vbscript|file):/i;
const INLINE_HANDLER = /\bon[a-z]+\s*=/i;

function stripControlCharacters(value: string): string {
  let output = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isControl =
      code <= 8 ||
      (code >= 11 && code <= 12) ||
      (code >= 14 && code <= 31) ||
      code === 127;
    if (!isControl) output += character;
  }
  return output;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a deliberately small markdown subset to escaped HTML. Raw markup is
 * never passed through: active-content tags, event handlers and non-HTTP URL
 * schemes are rejected with a stable validation code before rendering.
 */
export function renderSafeMarkdown(source: string): string {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new ValidationDomainException(
      'Note content must not be empty',
      ErrorCode.VAL_MISSING_FIELD,
    );
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new ValidationDomainException(
      `Note content exceeds ${MAX_SOURCE_LENGTH} characters`,
      ErrorCode.VAL_OUT_OF_RANGE,
    );
  }
  if (
    UNSAFE_TAG.test(source) ||
    UNSAFE_URL.test(source) ||
    INLINE_HANDLER.test(source)
  ) {
    throw new ValidationDomainException(
      'Note content contains unsafe markup',
      ErrorCode.VAL_WORKSPACE_UNSAFE_MARKUP,
    );
  }

  return escapeHtml(stripControlCharacters(source))
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" rel="noopener noreferrer">$1</a>',
    );
}
