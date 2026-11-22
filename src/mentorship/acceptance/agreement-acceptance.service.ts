import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';
import {
  ErrorCode,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../../common/errors';
import { MentorshipTelemetry } from '../../shared/mentorship-telemetry.service';
import { AcceptAgreementDto, PublishAgreementTermsDto } from './dto/agreement-acceptance.dto';
import {
  AcceptanceIntent,
  AgreementAcceptance,
  AgreementAcceptanceDocument,
  AgreementTerms,
  AgreementTermsDocument,
  computeTermsHash,
} from './schemas/agreement-acceptance.schema';

/** The authenticated caller, as resolved from the JWT by the controller. */
export interface AcceptanceActor {
  id: string;
  role: string;
}

/** Client-safe projection of an acceptance — never includes the terms body. */
export interface AcceptanceProof {
  id: string;
  agreementId: string;
  version: number;
  actorId: string;
  termsHash: string;
  termVersions: Record<string, number>;
  nonce: string;
  acceptedAt: Date;
}

function toProof(doc: AgreementAcceptanceDocument): AcceptanceProof {
  return {
    id: String(doc._id),
    agreementId: doc.agreementId,
    version: doc.version,
    actorId: doc.actorId,
    termsHash: doc.termsHash,
    termVersions: doc.termVersions,
    nonce: doc.nonce,
    acceptedAt: doc.acceptedAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

@Injectable()
export class AgreementAcceptanceService {
  constructor(
    @InjectModel(AgreementTerms.name)
    private readonly terms: Model<AgreementTermsDocument>,
    @InjectModel(AgreementAcceptance.name)
    private readonly acceptances: Model<AgreementAcceptanceDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  /** Emits a low-cardinality counter; telemetry must never break a business path. */
  private count(name: string, labels: Record<string, string> = {}): void {
    try {
      this.telemetry.count(name, labels);
    } catch {
      // Deliberately swallowed.
    }
  }

  private isPrivileged(actor: AcceptanceActor): boolean {
    return actor.role === Role.ADMIN || actor.role === Role.MODERATOR;
  }

  /** Deny by default: only coordinators may publish a new terms version. */
  private assertCanPublish(actor: AcceptanceActor): void {
    if (this.isPrivileged(actor)) return;
    this.count('agreement_acceptance_denied_total', { reason: 'publish_not_privileged' });
    throw new ForbiddenDomainException(
      'AGREEMENT_PUBLISH_DENIED',
      ErrorCode.MENTOR_ACCESS_DENIED,
    );
  }

  private isNonceWellFormed(nonce: string): boolean {
    return /^[A-Za-z0-9_-]{16,128}$/.test(nonce);
  }

  private validateTermVersions(termVersions: Record<string, number>): void {
    const valid =
      !!termVersions &&
      typeof termVersions === 'object' &&
      !Array.isArray(termVersions) &&
      Object.values(termVersions).every(
        (v) => Number.isInteger(v) && (v as number) >= 1,
      );
    if (!valid) {
      this.count('agreement_acceptance_validation_failed_total', { field: 'termVersions' });
      throw new ForbiddenDomainException(
        'AGREEMENT_TERM_VERSIONS_INVALID',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
  }

  /**
   * Appends a new immutable terms snapshot. Retries with the same version and
   * identical content return the existing snapshot without creating a new one.
   */
  async publishTerms(
    actor: AcceptanceActor,
    dto: PublishAgreementTermsDto,
  ): Promise<AgreementTermsDocument> {
    this.assertCanPublish(actor);

    const effectiveAt = new Date(dto.effectiveAt);
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new ForbiddenDomainException(
        'AGREEMENT_EFFECTIVE_DATE_INVALID',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const termsHash = computeTermsHash(dto.terms);
    const existing = await this.terms
      .findOne({ agreementId: dto.agreementId, version: dto.version })
      .exec();
    if (existing) {
      if (existing.termsHash === termsHash) {
        this.count('agreement_terms_replays_total');
        return existing;
      }
      this.count('agreement_terms_conflicts_total');
      throw new ForbiddenDomainException(
        'AGREEMENT_VERSION_CONFLICT',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    try {
      const created = await this.terms.create({
        agreementId: dto.agreementId,
        version: dto.version,
        participantIds: [...dto.participantIds],
        terms: dto.terms,
        termsHash,
        effectiveAt,
      });
      this.count('agreement_terms_published_total');
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      this.count('agreement_terms_replays_total');
      const winner = await this.terms
        .findOne({ agreementId: dto.agreementId, version: dto.version })
        .exec();
      if (!winner) throw error;
      return winner;
    }
  }

  /** Returns the current version without exposing the private terms body. */
  async currentVersion(
    agreementId: string,
  ): Promise<{ agreementId: string; version: number; termsHash: string; effectiveAt: Date }> {
    const current = await this.latestTerms(agreementId);
    return {
      agreementId: current.agreementId,
      version: current.version,
      termsHash: current.termsHash,
      effectiveAt: current.effectiveAt,
    };
  }

  private async latestTerms(agreementId: string): Promise<AgreementTermsDocument> {
    const current = await this.terms
      .findOne({ agreementId })
      .sort({ version: -1 })
      .exec();
    if (!current) {
      throw new ResourceNotFoundException(
        'AGREEMENT_TERMS_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return current;
  }

  /**
   * Records an explicit acceptance of the current terms version.
   *
   * Deny-by-default: the caller must be one of the intended participants;
   * privileged roles may not accept on someone else's behalf. A stale version
   * or a hash that does not commit to the current terms is rejected. Repeated
   * requests for the same (agreement, version, actor) return the original
   * evidence and create no duplicate records.
   */
  async accept(
    actor: AcceptanceActor,
    agreementId: string,
    dto: AcceptAgreementDto,
  ): Promise<AcceptanceProof> {
    if (!this.isNonceWellFormed(dto.nonce)) {
      this.count('agreement_acceptance_validation_failed_total', { field: 'nonce' });
      throw new ForbiddenDomainException(
        'AGREEMENT_NONCE_INVALID',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    this.validateTermVersions(dto.termVersions);

    const current = await this.latestTerms(agreementId);

    if (!current.participantIds.includes(actor.id)) {
      this.count('agreement_acceptance_denied_total', { reason: 'not_participant' });
      throw new ForbiddenDomainException(
        'AGREEMENT_ACCEPT_DENIED',
        ErrorCode.MENTOR_ACCESS_DENIED,
      );
    }

    if (dto.version !== current.version || dto.termsHash !== current.termsHash) {
      this.count('agreement_acceptance_stale_total');
      throw new ForbiddenDomainException(
        'AGREEMENT_TERMS_STALE',
        ErrorCode.MENTOR_STALE_VERSION,
      );
    }

    const existing = await this.acceptances
      .findOne({ agreementId, version: dto.version, actorId: actor.id })
      .exec();
    if (existing) {
      this.count('agreement_acceptance_replays_total');
      return toProof(existing);
    }

    try {
      const created = await this.acceptances.create({
        agreementId,
        version: dto.version,
        actorId: actor.id,
        termsHash: dto.termsHash,
        termVersions: { ...dto.termVersions },
        nonce: dto.nonce,
        intent: AcceptanceIntent.ACCEPT,
        acceptedAt: new Date(),
      });
      this.count('agreement_acceptance_recorded_total');
      return toProof(created);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      this.count('agreement_acceptance_replays_total');
      const winner = await this.acceptances
        .findOne({ agreementId, version: dto.version, actorId: actor.id })
        .exec();
      if (!winner) throw error;
      return toProof(winner);
    }
  }

  /**
   * Returns one acceptance proof. Only the accepting actor or a coordinator
   * may read it; the private agreement body is never part of the projection.
   */
  async proof(
    actor: AcceptanceActor,
    agreementId: string,
    version: number,
    subjectId: string,
  ): Promise<AcceptanceProof> {
    if (actor.id !== subjectId && !this.isPrivileged(actor)) {
      this.count('agreement_acceptance_denied_total', { reason: 'proof_other_actor' });
      throw new ForbiddenDomainException(
        'AGREEMENT_PROOF_DENIED',
        ErrorCode.MENTOR_ACCESS_DENIED,
      );
    }
    const doc = await this.acceptances
      .findOne({ agreementId, version, actorId: subjectId })
      .exec();
    if (!doc) {
      throw new ResourceNotFoundException(
        'AGREEMENT_ACCEPTANCE_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return toProof(doc);
  }

  /** Lists client-safe proofs; restricted to participants or coordinators. */
  async history(actor: AcceptanceActor, agreementId: string): Promise<AcceptanceProof[]> {
    const current = await this.latestTerms(agreementId);
    if (!current.participantIds.includes(actor.id) && !this.isPrivileged(actor)) {
      this.count('agreement_acceptance_denied_total', { reason: 'history_not_participant' });
      throw new ForbiddenDomainException(
        'AGREEMENT_HISTORY_DENIED',
        ErrorCode.MENTOR_ACCESS_DENIED,
      );
    }
    const docs = await this.acceptances.find({ agreementId }).sort({ version: -1 }).exec();
    return docs.map(toProof);
  }
}
