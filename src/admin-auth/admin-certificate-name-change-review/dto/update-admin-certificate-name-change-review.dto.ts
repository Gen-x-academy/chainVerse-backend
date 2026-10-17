import { PartialType } from '@nestjs/swagger';
import { CreateAdminCertificateNameChangeReviewDto } from './create-admin-certificate-name-change-review.dto';

export class UpdateAdminCertificateNameChangeReviewDto extends PartialType(
  CreateAdminCertificateNameChangeReviewDto,
) {}
