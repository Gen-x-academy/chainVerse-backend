import { extname } from 'node:path';
import { ALLOWED_FILE_TYPES, AllowedFileType } from './upload.constants';

export interface FileValidationResult {
  valid: boolean;
  /** The allow-list entry the file matched, when valid. */
  type?: AllowedFileType;
  /** Extension (including the dot) that should be used for storage. */
  extension?: string;
  reason?: string;
}

/**
 * Strips directory components, control characters and leading dots from a
 * caller-supplied filename so it can be stored as metadata without being able
 * to influence any path.
 *
 * The sanitized value is *never* used to build a storage path — see
 * `FileStorageService`, which always generates its own random name.
 */
export function sanitizeOriginalName(name: string | undefined): string {
  if (!name) return 'unnamed';

  // Take the basename under both POSIX and Windows separators.
  const base = name.split(/[\\/]/).pop() ?? 'unnamed';

  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 128);

  return cleaned.length > 0 ? cleaned : 'unnamed';
}

/** True when `buffer` starts with `signature`. */
export function hasSignature(buffer: Buffer, signature: Buffer): boolean {
  if (buffer.length < signature.length) return false;
  return buffer.subarray(0, signature.length).equals(signature);
}

/**
 * Validates a buffer against the upload allow-list.
 *
 * All three of the declared MIME type, the filename extension and the leading
 * magic bytes must agree; a mismatch between any pair is rejected, since that
 * is the signature of a content-type confusion attempt.
 */
export function validateUploadedFile(
  buffer: Buffer,
  declaredMimeType: string | undefined,
  originalName: string | undefined,
): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'File is empty' };
  }

  const mimeType = (declaredMimeType ?? '').split(';')[0].trim().toLowerCase();
  const type = ALLOWED_FILE_TYPES.find((entry) => entry.mimeType === mimeType);

  if (!type) {
    return {
      valid: false,
      reason: `Unsupported content type "${declaredMimeType ?? 'unknown'}"`,
    };
  }

  const extension = extname(sanitizeOriginalName(originalName)).toLowerCase();
  if (!type.extensions.includes(extension)) {
    return {
      valid: false,
      reason: `Extension "${extension || 'none'}" does not match content type "${mimeType}"`,
    };
  }

  const signatureMatches = type.signatures.some((signature) =>
    hasSignature(buffer, signature),
  );
  if (!signatureMatches) {
    return {
      valid: false,
      reason: `File contents do not match the declared type "${mimeType}"`,
    };
  }

  return { valid: true, type, extension };
}
