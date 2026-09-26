import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EncryptedPayload } from '../schemas/milestone-evidence.schema';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Application-level encryption for milestone evidence.
 *
 * Every ciphertext is bound to its record through additional authenticated
 * data, so copying one record's payload onto another fails authentication
 * instead of silently disclosing it under the wrong award.
 */
@Injectable()
export class EvidenceEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EvidenceEncryptionService.name);
  private key!: Buffer;
  private digestKey!: Buffer;
  private keyId!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.keyId =
      this.config.get<string>('scholarship.evidenceEncryptionKeyId') ?? 'v1';
    const encoded = this.config.get<string>(
      'scholarship.evidenceEncryptionKey',
    );

    if (encoded) {
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) {
        throw new Error(
          'SCHOLARSHIP_EVIDENCE_ENCRYPTION_KEY must decode to exactly 32 bytes',
        );
      }
      this.key = key;
    } else {
      if (this.config.get<string>('nodeEnv') === 'production') {
        throw new Error(
          'SCHOLARSHIP_EVIDENCE_ENCRYPTION_KEY is required in production',
        );
      }
      this.logger.warn(
        'SCHOLARSHIP_EVIDENCE_ENCRYPTION_KEY is not set; deriving a development key from JWT_SECRET. Never use this in production.',
      );
      this.key = crypto
        .createHash('sha256')
        .update(
          `scholarship-evidence:${this.config.get<string>('jwtSecret') ?? 'development'}`,
        )
        .digest();
    }

    // A separate key for digests means a digest never doubles as key material.
    this.digestKey = crypto
      .createHmac('sha256', this.key)
      .update('scholarship-evidence-digest')
      .digest();
  }

  encrypt(plaintext: string, aad: string): EncryptedPayload {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return {
      algorithm: ALGORITHM,
      keyId: this.keyId,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload, aad: string): string {
    if (payload.algorithm !== ALGORITHM || payload.keyId !== this.keyId) {
      throw new InternalServerErrorException(
        `Evidence was encrypted with key "${payload.keyId}", which is not loaded`,
      );
    }
    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(payload.iv, 'base64'),
      );
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      this.logger.error('Evidence payload failed authentication');
      throw new InternalServerErrorException(
        'Evidence payload could not be decrypted',
      );
    }
  }

  /** Keyed digest used for duplicate detection without exposing content. */
  digest(content: string): string {
    return crypto
      .createHmac('sha256', this.digestKey)
      .update(content)
      .digest('hex');
  }
}
