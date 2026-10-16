import {
  hasSignature,
  sanitizeOriginalName,
  validateUploadedFile,
} from './file-validation';

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.from('some document body'),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32),
]);

describe('sanitizeOriginalName', () => {
  it('strips POSIX directory traversal', () => {
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
  });

  it('strips Windows directory traversal', () => {
    expect(sanitizeOriginalName('..\\..\\windows\\system32\\cmd.exe')).toBe(
      'cmd.exe',
    );
  });

  it('removes leading dots so no dotfile can be produced', () => {
    expect(sanitizeOriginalName('...hidden.pdf')).toBe('hidden.pdf');
  });

  it('replaces characters outside the safe set', () => {
    expect(sanitizeOriginalName('re;port$(whoami).pdf')).toBe(
      're_port__whoami_.pdf',
    );
  });

  it('drops embedded null bytes and control characters', () => {
    expect(sanitizeOriginalName('report\u0000.pdf\u0007')).toBe('report.pdf');
  });

  it('caps very long names', () => {
    expect(sanitizeOriginalName('a'.repeat(500)).length).toBe(128);
  });

  it('falls back to a placeholder for empty or missing names', () => {
    expect(sanitizeOriginalName(undefined)).toBe('unnamed');
    expect(sanitizeOriginalName('')).toBe('unnamed');
    expect(sanitizeOriginalName('...')).toBe('unnamed');
  });
});

describe('hasSignature', () => {
  it('matches a leading prefix', () => {
    expect(hasSignature(PDF, Buffer.from('%PDF-'))).toBe(true);
  });

  it('does not match when the prefix appears later', () => {
    expect(hasSignature(Buffer.from('xx%PDF-'), Buffer.from('%PDF-'))).toBe(
      false,
    );
  });

  it('handles buffers shorter than the signature', () => {
    expect(hasSignature(Buffer.from('%P'), Buffer.from('%PDF-'))).toBe(false);
  });
});

describe('validateUploadedFile', () => {
  it.each([
    ['application/pdf', 'doc.pdf', PDF],
    ['image/png', 'logo.png', PNG],
    ['image/jpeg', 'photo.jpg', JPEG],
    ['image/jpeg', 'photo.jpeg', JPEG],
  ])('accepts a well-formed %s', (mime, name, buffer) => {
    const result = validateUploadedFile(buffer, mime, name);

    expect(result.valid).toBe(true);
    expect(result.type?.mimeType).toBe(mime);
  });

  it('accepts a content type carrying parameters', () => {
    expect(
      validateUploadedFile(PDF, 'application/pdf; charset=binary', 'doc.pdf')
        .valid,
    ).toBe(true);
  });

  it('rejects an empty file', () => {
    const result = validateUploadedFile(
      Buffer.alloc(0),
      'application/pdf',
      'a.pdf',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/empty/i);
  });

  it('rejects a content type outside the allow-list', () => {
    const result = validateUploadedFile(
      Buffer.from('MZ\x90\x00'),
      'application/x-msdownload',
      'setup.exe',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unsupported content type/);
  });

  it('rejects an extension that disagrees with the content type', () => {
    const result = validateUploadedFile(PDF, 'application/pdf', 'doc.png');

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match content type/);
  });

  it('rejects a file with no extension', () => {
    const result = validateUploadedFile(PDF, 'application/pdf', 'doc');

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Extension "none"/);
  });

  // The core content-confusion case: everything the caller controls says PDF,
  // but the bytes are an executable.
  it('rejects an executable masquerading as a PDF', () => {
    const result = validateUploadedFile(
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00'),
      'application/pdf',
      'invoice.pdf',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/do not match the declared type/);
  });

  it('rejects a shell script renamed to .png', () => {
    const result = validateUploadedFile(
      Buffer.from('#!/bin/sh\nrm -rf /\n'),
      'image/png',
      'avatar.png',
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/do not match the declared type/);
  });

  it('rejects PNG bytes declared as JPEG', () => {
    const result = validateUploadedFile(PNG, 'image/jpeg', 'photo.jpg');

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/do not match the declared type/);
  });

  it('rejects a traversal filename whose sanitized extension no longer matches', () => {
    const result = validateUploadedFile(
      PDF,
      'application/pdf',
      '../../evil.png',
    );

    expect(result.valid).toBe(false);
  });

  it('rejects a missing content type', () => {
    expect(validateUploadedFile(PDF, undefined, 'doc.pdf').valid).toBe(false);
  });
});
