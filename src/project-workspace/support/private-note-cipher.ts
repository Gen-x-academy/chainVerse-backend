import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BusinessRuleException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export interface PrivateNotePayload {
  title: string;
  content: string;
}

export interface PrivateNoteCiphertext {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
  algorithm: string;
}

/** AES-256-GCM envelope for owner-only researcher notes. */
export class PrivateNoteCipher {
  constructor(private readonly config: ConfigService) {}

  private key(): { bytes: Buffer; keyId: string } {
    const encoded = this.config.get<string>('projectNotes.encryptionKey');
    if (!encoded) {
      throw new BusinessRuleException(
        'Private researcher notes are disabled: PROJECT_NOTES_ENCRYPTION_KEY is not configured',
        ErrorCode.BIZ_WORKSPACE_PRIVATE_NOTES_DISABLED,
      );
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== 32) {
      throw new BusinessRuleException(
        'PROJECT_NOTES_ENCRYPTION_KEY must decode to 32 bytes',
        ErrorCode.BIZ_WORKSPACE_PRIVATE_NOTES_DISABLED,
      );
    }
    return {
      bytes,
      keyId: this.config.get<string>('projectNotes.encryptionKeyId') ?? 'v1',
    };
  }

  encrypt(payload: PrivateNotePayload): PrivateNoteCiphertext {
    const { bytes, keyId } = this.key();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, bytes, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyId,
      algorithm: ALGORITHM,
    };
  }

  decrypt(envelope: PrivateNoteCiphertext): PrivateNotePayload {
    const { bytes } = this.key();
    if (envelope.algorithm !== ALGORITHM) {
      throw new BusinessRuleException(
        'Unsupported private note encryption algorithm',
        ErrorCode.BIZ_WORKSPACE_PRIVATE_NOTE_DECRYPT_FAILED,
      );
    }
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        bytes,
        Buffer.from(envelope.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const parsed = JSON.parse(plain) as Partial<PrivateNotePayload>;
      if (
        typeof parsed.title !== 'string' ||
        typeof parsed.content !== 'string'
      ) {
        throw new Error('invalid payload shape');
      }
      return { title: parsed.title, content: parsed.content };
    } catch {
      throw new BusinessRuleException(
        'Private note could not be authenticated or decrypted',
        ErrorCode.BIZ_WORKSPACE_PRIVATE_NOTE_DECRYPT_FAILED,
      );
    }
  }
}
