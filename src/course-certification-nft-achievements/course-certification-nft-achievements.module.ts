import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseCertificationNftAchievementsController } from './course-certification-nft-achievements.controller';
import { CourseCertificationNftAchievementsService } from './course-certification-nft-achievements.service';
import {
  CertificateTx,
  CertificateTxSchema,
} from '../stellar/schemas/certificate-tx.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CertificateTx.name, schema: CertificateTxSchema },
    ]),
  ],
  controllers: [CourseCertificationNftAchievementsController],
  providers: [CourseCertificationNftAchievementsService],
})
export class CourseCertificationNftAchievementsModule {}
