import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CertificateTx, CertificateTxDocument } from '../stellar/schemas/certificate-tx.schema';

export interface ShareLink {
  certificateId: string;
  linkedInUrl: string;
  openGraphUrl: string;
  shareUrl: string;
}

@Injectable()
export class CertificateSocialSharingService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(CertificateTx.name)
    private readonly certTxModel: Model<CertificateTxDocument>,
  ) {}

  async generateShareLink(certificateId: string): Promise<ShareLink> {
    const certificate = await this.certTxModel
      .findOne({ certificateId })
      .exec();

    if (!certificate) {
      throw new NotFoundException(`Certificate ${certificateId} not found`);
    }

    const baseUrl = (this.configService.get<string>('baseUrl') ?? '').replace(/\/$/, '');
    const shareUrl = `${baseUrl}/certificates/${encodeURIComponent(certificateId)}`;

    // LinkedIn share URL — uses the public certificate page as the share target
    const linkedInUrl =
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

    // Generic Open Graph share URL (usable in any og-aware platform)
    const openGraphUrl = shareUrl;

    return {
      certificateId,
      linkedInUrl,
      openGraphUrl,
      shareUrl,
    };
  }
}
