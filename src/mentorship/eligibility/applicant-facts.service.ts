import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode } from '../../common/errors';
import { Enrollment, EnrollmentDocument } from '../../student-enrollment/schemas/enrollment.schema';
import {
  MentorshipApplication,
  MentorshipApplicationDocument,
  OPEN_STATUSES,
} from '../applications/schemas/mentorship-application.schema';
import { MentorshipProgram } from '../programs/schemas/mentorship-program.schema';
import { AnswerValue } from '../forms/domain/question.types';
import { MentorshipDomainException } from '../shared/mentorship-errors';
import { ApplicantFacts } from './domain/eligibility-rule.types';

/**
 * Collects the server-side facts eligibility rules are evaluated against.
 *
 * Dependencies: StudentEnrollment (`enrollments` collection, status
 * `completed`) for course completion. Facts are always read fresh from the
 * database – the client cannot supply or override them.
 */
@Injectable()
export class ApplicantFactsService {
  constructor(
    @InjectModel(Enrollment.name)
    private readonly enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(MentorshipApplication.name)
    private readonly applicationModel: Model<MentorshipApplicationDocument>,
  ) {}

  async collect(
    applicantId: string,
    program: MentorshipProgram & { _id: unknown },
    answers: Record<string, AnswerValue>,
    formQuestionKeys: string[],
  ): Promise<ApplicantFacts> {
    try {
      const [completed, activeApplicationCount] = await Promise.all([
        this.enrollmentModel.find({ studentId: applicantId, status: 'completed' }, { courseId: 1 }).lean().exec(),
        this.applicationModel
          .countDocuments({ applicantId, status: { $in: OPEN_STATUSES }, programId: { $ne: program._id } })
          .exec(),
      ]);

      return {
        now: new Date(),
        programStatus: program.status,
        applicationOpensAt: program.applicationOpensAt,
        applicationClosesAt: program.applicationClosesAt,
        completedCourseIds: completed.map((e) => String(e.courseId)),
        activeApplicationCount,
        answers,
        formQuestionKeys,
      };
    } catch {
      // Fail closed with a retryable error instead of evaluating on partial data.
      throw new MentorshipDomainException(
        'Eligibility data is temporarily unavailable; please retry',
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SYS_SERVICE_UNAVAILABLE,
      );
    }
  }
}
