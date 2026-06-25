import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CertificationService } from './certification.service';

@Controller(['certification', 'v1/certification'])
export class CertificationController {
  constructor(private readonly certificationService: CertificationService) {}

  @Get(':id/download')
  async downloadCertificate(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const fileBuffer = this.certificationService.generateCertificateFile(id);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="certificate-${id}.txt"`,
    });
    return fileBuffer;
  }
}
