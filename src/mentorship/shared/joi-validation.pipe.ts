import { HttpException, HttpStatus, PipeTransform } from '@nestjs/common';
import * as Joi from 'joi';
import { ErrorCode } from '../../common/errors';

/**
 * Validation error carrying field-level details.
 *
 * `details` is surfaced by AllExceptionsFilter so clients can map each
 * problem back to a field without parsing the message.
 */
export class MentorshipValidationException extends HttpException {
  constructor(
    message: string,
    details: Array<{ field: string; issue: string }>,
    errorCode: ErrorCode = ErrorCode.VAL_INVALID_INPUT,
  ) {
    super({ message, errorCode, details }, HttpStatus.BAD_REQUEST);
  }
}

/**
 * Validates and normalises a request body / query with a Joi schema.
 * Unknown keys are rejected so typos never silently drop data.
 */
export class JoiValidationPipe<T = unknown> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: Joi.Schema<T>) {}

  transform(value: unknown): T {
    const { error, value: validated } = this.schema.validate(value ?? {}, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: false,
      convert: true,
    });

    if (error) {
      throw new MentorshipValidationException(
        'Request validation failed',
        error.details.map((d) => ({
          field: d.path.join('.') || '(root)',
          issue: d.message.replace(/"/g, ''),
        })),
      );
    }

    return validated;
  }
}

export const objectId = () =>
  Joi.string().pattern(/^[a-f0-9]{24}$/i, 'ObjectId').messages({
    'string.pattern.name': '{{#label}} must be a 24-character hex id',
  });
