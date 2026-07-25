import { Injectable } from '@nestjs/common';

@Injectable()
export class CertificationService {
  generateCertificateFile(certificateId: string): Buffer {
    const fileContents = `ChainVerse certificate download placeholder for ${certificateId}`;
    return Buffer.from(fileContents, 'utf8');
  }
}
