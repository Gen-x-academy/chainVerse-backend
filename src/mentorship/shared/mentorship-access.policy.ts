import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import {
  ErrorCode,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors';
import {
  MentorshipProgram,
  MentorshipProgramDocument,
} from '../programs/schemas/mentorship-program.schema';
import {
  ProgramReviewer,
  ProgramReviewerDocument,
} from '../programs/schemas/program-reviewer.schema';
import { MentorshipUser } from './mentorship-context';
import { MentorshipTelemetry } from './mentorship-telemetry.service';

/**
 * Resource-level authorization for mentorship programs.
 *
 * Rules (deny unless one matches):
 * - Platform admins may manage and review every program.
 * - The program owner may manage the program, its forms, rules, reviewers
 *   and queue.
 * - An *active* scoped reviewer may see that program's queue; a `lead`
 *   reviewer may also assign others and triage.
 * - Applicants may only ever see their own applications.
 */
@Injectable()
export class MentorshipAccessPolicy {
  constructor(
    @InjectModel(MentorshipProgram.name)
    private readonly programModel: Model<MentorshipProgramDocument>,
    @InjectModel(ProgramReviewer.name)
    private readonly reviewerModel: Model<ProgramReviewerDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  isAdmin(user: MentorshipUser): boolean {
    return user.role === Role.ADMIN;
  }

  isOwner(user: MentorshipUser, program: Pick<MentorshipProgram, 'ownerId'>): boolean {
    return program.ownerId === user.id;
  }

  async loadProgram(programId: string): Promise<MentorshipProgramDocument> {
    const program = isValidObjectId(programId)
      ? await this.programModel.findById(programId).exec()
      : null;
    if (!program) {
      throw new ResourceNotFoundException('Mentorship program not found', ErrorCode.MENTOR_PROGRAM_NOT_FOUND);
    }
    return program;
  }

  async activeMembership(programId: string, userId: string): Promise<ProgramReviewerDocument | null> {
    return this.reviewerModel.findOne({ programId, reviewerId: userId, active: true }).exec();
  }

  /** Owner or admin – required to edit forms, rules, reviewers and program settings. */
  assertCanManageProgram(user: MentorshipUser, program: MentorshipProgramDocument): void {
    if (this.isAdmin(user) || this.isOwner(user, program)) return;
    this.deny('manage_program');
  }

  /** Owner, admin or any active scoped reviewer. */
  async assertCanViewProgramInternals(
    user: MentorshipUser,
    program: MentorshipProgramDocument,
  ): Promise<ProgramReviewerDocument | null> {
    if (this.isAdmin(user) || this.isOwner(user, program)) return null;
    const membership = await this.activeMembership(String(program._id), user.id);
    if (!membership) this.deny('view_program');
    return membership;
  }

  /** Owner, admin or lead reviewer – may assign others, triage and see all workloads. */
  async canLeadQueue(user: MentorshipUser, program: MentorshipProgramDocument): Promise<boolean> {
    if (this.isAdmin(user) || this.isOwner(user, program)) return true;
    const membership = await this.activeMembership(String(program._id), user.id);
    return membership?.role === 'lead';
  }

  /**
   * Program ids whose review queue the user may read, or `null` for "all"
   * (admins). An empty array means the user sees nothing.
   */
  async queueScope(user: MentorshipUser): Promise<string[] | null> {
    if (this.isAdmin(user)) return null;
    const [owned, memberships] = await Promise.all([
      this.programModel.find({ ownerId: user.id }, { _id: 1 }).lean().exec(),
      this.reviewerModel.find({ reviewerId: user.id, active: true }, { programId: 1 }).lean().exec(),
    ]);
    const ids = new Set<string>([
      ...owned.map((p) => String(p._id)),
      ...memberships.map((m) => String(m.programId)),
    ]);
    return [...ids];
  }

  deny(reason: string, message = 'You do not have access to this mentorship resource'): never {
    this.telemetry.count('mentorship_authz_denied_total', { reason });
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }
}
