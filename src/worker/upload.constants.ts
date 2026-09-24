/**
 * Upload lifecycle states.
 *
 * A file is only ever readable in the `CLEAN` state. Everything else keeps the
 * bytes inside the quarantine tree (or removes them entirely).
 */
export enum UploadStatus {
  /** Accepted, written to quarantine, not yet scanned. */
  PENDING = 'pending',
  /** A scan is in flight. */
  SCANNING = 'scanning',
  /** Scanned and released to the clean store. */
  CLEAN = 'clean',
  /** Scanner reported a detection; bytes quarantined or deleted. */
  INFECTED = 'infected',
  /** Scanner could not produce a verdict; treated as unavailable. */
  ERROR = 'error',
}

/** Statuses whose bytes may be served to a caller. */
export const SERVABLE_STATUSES: readonly UploadStatus[] = [UploadStatus.CLEAN];

/**
 * Allow-list of accepted upload types.
 *
 * Each entry pins the MIME type to its permitted extensions *and* to the magic
 * byte prefix that must appear at the start of the file, so a caller cannot
 * pass a script through by lying about `Content-Type` or the filename.
 */
export interface AllowedFileType {
  mimeType: string;
  extensions: readonly string[];
  /** Byte prefixes, any of which is a valid signature for this type. */
  signatures: readonly Buffer[];
}

export const ALLOWED_FILE_TYPES: readonly AllowedFileType[] = [
  {
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    signatures: [Buffer.from('%PDF-', 'ascii')],
  },
  {
    mimeType: 'image/png',
    extensions: ['.png'],
    signatures: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  },
  {
    mimeType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    signatures: [Buffer.from([0xff, 0xd8, 0xff])],
  },
];

export const ALLOWED_MIME_TYPES: readonly string[] = ALLOWED_FILE_TYPES.map(
  (type) => type.mimeType,
);
