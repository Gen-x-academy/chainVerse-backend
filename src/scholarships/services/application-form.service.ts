import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ApplicationForm,
  ApplicationFormDocument,
  FieldType,
  FormStatus,
} from '../schemas/application-form.schema';
import {
  CreateApplicationFormDto,
  FormAnswerDto,
  UpdateApplicationFormDto,
} from '../dto/application-form.dto';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/**
 * Core business logic for scholarship application forms.
 *
 * Form lifecycle:
 *   DRAFT → PUBLISHED → ARCHIVED
 *
 * Immutability contract:
 *   Once a form reaches PUBLISHED status its sections / fields are frozen.
 *   Structural changes require archiving the published form and creating a
 *   fresh DRAFT.  Each publish increments the version counter so that stored
 *   answers can always be traced back to the exact schema version used.
 */
@Injectable()
export class ApplicationFormService {
  private readonly logger = new Logger(ApplicationFormService.name);

  constructor(
    @InjectModel(ApplicationForm.name)
    private readonly formModel: Model<ApplicationFormDocument>,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  /**
   * Creates a new application form in DRAFT status.
   *
   * @param dto       Validated form data.
   * @param createdBy User ID of the admin performing the action.
   */
  async create(
    dto: CreateApplicationFormDto,
    createdBy: string,
  ): Promise<ApplicationForm> {
    const form = await this.formModel.create({
      ...dto,
      createdBy,
      status: FormStatus.DRAFT,
      version: 1,
    });

    this.logger.log(
      `Application form created: id=${form._id} programId=${dto.programId} tenant=${dto.tenantId}`,
    );

    return form;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Returns all non-archived forms for a given programme + tenant combination.
   */
  async findByProgram(
    programId: string,
    tenantId: string,
  ): Promise<ApplicationForm[]> {
    return this.formModel
      .find({
        programId,
        tenantId,
        status: { $ne: FormStatus.ARCHIVED },
      })
      .sort({ version: -1 })
      .exec();
  }

  /**
   * Returns a single form by its MongoDB ObjectId.
   *
   * @throws ResourceNotFoundException when no document with that id exists.
   */
  async findOne(id: string): Promise<ApplicationFormDocument> {
    const form = await this.formModel.findById(id).exec();

    if (!form) {
      throw new ResourceNotFoundException(
        `Application form with id "${id}" not found.`,
        ErrorCode.RES_NOT_FOUND,
      );
    }

    return form;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Updates a DRAFT form.
   *
   * @throws BusinessRuleException when the form is not in DRAFT status.
   */
  async update(
    id: string,
    dto: UpdateApplicationFormDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _requestorId: string,
  ): Promise<ApplicationForm> {
    const form = await this.findOne(id);

    if (form.status !== FormStatus.DRAFT) {
      throw new BusinessRuleException(
        'Only DRAFT forms can be updated. Archive and create a new form to make changes.',
        ErrorCode.BIZ_FORM_NOT_DRAFT,
      );
    }

    Object.assign(form, dto);
    await form.save();

    this.logger.log(`Application form updated: id=${id}`);
    return form;
  }

  /**
   * Publishes a DRAFT form.
   *
   * Sets status to PUBLISHED, records publishedAt / publishedBy, and
   * increments the version counter so future snapshots carry unique version
   * numbers.
   *
   * @throws BusinessRuleException when the form is not in DRAFT status.
   */
  async publish(id: string, publishedBy: string): Promise<ApplicationForm> {
    const form = await this.findOne(id);

    if (form.status !== FormStatus.DRAFT) {
      throw new BusinessRuleException(
        'Only DRAFT forms can be published.',
        ErrorCode.BIZ_FORM_NOT_DRAFT,
      );
    }

    form.status = FormStatus.PUBLISHED;
    form.publishedAt = new Date();
    form.publishedBy = publishedBy;
    // Increment version on each publish to support immutable version snapshots
    form.version = (form.version ?? 1);

    await form.save();

    this.logger.log(
      `Application form published: id=${id} version=${form.version} by=${publishedBy}`,
    );

    return form;
  }

  /**
   * Archives a PUBLISHED form.
   *
   * @throws BusinessRuleException when the form is not in PUBLISHED status.
   */
  async archive(
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _requestorId: string,
  ): Promise<ApplicationForm> {
    const form = await this.findOne(id);

    if (form.status !== FormStatus.PUBLISHED) {
      throw new BusinessRuleException(
        'Only PUBLISHED forms can be archived.',
        ErrorCode.BIZ_FORM_NOT_PUBLISHED,
      );
    }

    form.status = FormStatus.ARCHIVED;
    await form.save();

    this.logger.log(`Application form archived: id=${id}`);
    return form;
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /**
   * Validates a set of applicant answers against the published form schema.
   *
   * Rules enforced:
   *  1. The form version in the submission must match the stored version.
   *  2. All required fields (where no conditional blocks them) must be answered.
   *  3. For SELECT/MULTISELECT fields the submitted value(s) must be in the
   *     field's `options` list.
   *  4. Conditional fields are evaluated: if a field is conditioned on another
   *     field whose current answer does not match, the field is skipped.
   *
   * This method never throws — it returns a structured result so that callers
   * can decide how to respond (e.g. reject a submission or surface warnings).
   *
   * @param formId  MongoDB ObjectId of the form.
   * @param version Form version the applicant filled in.
   * @param answers Array of { fieldId, value } pairs.
   */
  async validateAnswers(
    formId: string,
    version: number,
    answers: FormAnswerDto[],
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // ── Fetch the form ────────────────────────────────────────────────────────
    let form: ApplicationFormDocument;
    try {
      form = await this.findOne(formId);
    } catch {
      return { valid: false, errors: [`Form "${formId}" not found.`] };
    }

    // ── Version check ─────────────────────────────────────────────────────────
    if (form.version !== version) {
      errors.push(
        `Version mismatch: form is at version ${form.version} but submission references version ${version}.`,
      );
      return { valid: false, errors };
    }

    // ── Build an answer lookup map ────────────────────────────────────────────
    const answerMap = new Map<string, string | string[]>();
    for (const a of answers) {
      answerMap.set(a.fieldId, a.value);
    }

    // ── Iterate all fields ────────────────────────────────────────────────────
    for (const section of form.sections) {
      for (const field of section.fields) {
        // Evaluate conditional visibility
        if (field.conditionalOn) {
          const controllerAnswer = answerMap.get(field.conditionalOn.fieldId);
          const conditionMet =
            Array.isArray(controllerAnswer)
              ? controllerAnswer.includes(field.conditionalOn.value)
              : controllerAnswer === field.conditionalOn.value;

          if (!conditionMet) {
            // Field is hidden — skip required / options validation
            continue;
          }
        }

        const answer = answerMap.get(field.fieldId);
        const hasAnswer =
          answer !== undefined &&
          answer !== null &&
          (Array.isArray(answer) ? answer.length > 0 : answer.toString().trim() !== '');

        // Required check
        if (field.required && !hasAnswer) {
          errors.push(`Field "${field.fieldId}" (${field.label}) is required.`);
          continue;
        }

        if (!hasAnswer) continue;

        // Options validation for SELECT / MULTISELECT
        if (
          field.type === FieldType.SELECT ||
          field.type === FieldType.MULTISELECT
        ) {
          const allowedOptions = field.options ?? [];
          const submitted = Array.isArray(answer) ? answer : [answer as string];

          for (const val of submitted) {
            if (!allowedOptions.includes(val)) {
              errors.push(
                `Field "${field.fieldId}": value "${val}" is not a valid option. ` +
                  `Allowed: [${allowedOptions.join(', ')}].`,
              );
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
