import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import type { ObjectSchema, ValidationResult } from 'joi';
import { DomainException, ErrorCode } from '../../common/errors';

/**
 * Validates and normalises a request body against a Joi schema.
 *
 * Unknown keys are rejected (not silently stripped) so that clients cannot
 * smuggle fields such as `organizationId` or `status` into a write.
 */
@Injectable()
export class JoiValidationPipe<T = unknown> implements PipeTransform {
  constructor(private readonly schema: ObjectSchema<T>) {}

  transform(value: unknown): T {
    const result: ValidationResult<T> = this.schema.validate(value ?? {}, {
      abortEarly: false,
      allowUnknown: false,
      convert: true,
    });
    if (result.error) {
      throw new DomainException(
        result.error.details.map((d) => d.message).join('; '),
        HttpStatus.BAD_REQUEST,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
    return result.value;
  }
}
