import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PrivateNoteCipher } from './private-note-cipher';

const key = Buffer.alloc(32, 7).toString('base64');
const config = (values: Record<string, string | undefined>) =>
  ({ get: (name: string) => values[name] }) as ConfigService;

describe('PrivateNoteCipher', () => {
  it('round-trips title and body without storing plaintext', () => {
    const cipher = new PrivateNoteCipher(
      config({
        'projectNotes.encryptionKey': key,
        'projectNotes.encryptionKeyId': 'v1',
      }),
    );
    const envelope = cipher.encrypt({
      title: 'Sensitive hypothesis',
      content: 'Private researcher note body',
    });

    expect(JSON.stringify(envelope)).not.toContain('Sensitive hypothesis');
    expect(JSON.stringify(envelope)).not.toContain(
      'Private researcher note body',
    );
    expect(envelope.keyId).toBe('v1');
    expect(envelope.algorithm).toBe('aes-256-gcm');
    expect(cipher.decrypt(envelope)).toEqual({
      title: 'Sensitive hypothesis',
      content: 'Private researcher note body',
    });
  });

  it('fails closed when no key is configured', () => {
    const cipher = new PrivateNoteCipher(config({}));
    try {
      cipher.encrypt({ title: 't', content: 'c' });
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as DomainException).errorCode).toBe(
        ErrorCode.BIZ_WORKSPACE_PRIVATE_NOTES_DISABLED,
      );
    }
  });

  it('rejects a 32-byte key requirement and tampered ciphertext', () => {
    const badKey = new PrivateNoteCipher(
      config({ 'projectNotes.encryptionKey': 'short' }),
    );
    expect(() => badKey.encrypt({ title: 't', content: 'c' })).toThrow();

    const cipher = new PrivateNoteCipher(
      config({ 'projectNotes.encryptionKey': key }),
    );
    const envelope = cipher.encrypt({ title: 't', content: 'c' });
    expect(() =>
      cipher.decrypt({
        ...envelope,
        authTag: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow('could not be authenticated');
  });
});
