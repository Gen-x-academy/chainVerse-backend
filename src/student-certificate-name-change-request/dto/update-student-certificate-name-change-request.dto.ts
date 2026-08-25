import { PartialType } from '@nestjs/swagger';
import { CreateStudentCertificateNameChangeRequestDto } from './create-student-certificate-name-change-request.dto';

/**
 * Owner-editable fields only. Status is never taken from here — a decision goes
 * through the staff-only review endpoint.
 */
export class UpdateStudentCertificateNameChangeRequestDto extends PartialType(
  CreateStudentCertificateNameChangeRequestDto,
) {}
