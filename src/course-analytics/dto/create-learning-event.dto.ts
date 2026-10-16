import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/** Largest accepted `payload`, as JSON text. Events are small facts, not documents. */
export const MAX_PAYLOAD_BYTES = 10_000;

/** Rejects a value whose JSON form is larger than `maxBytes`. */
function MaxJsonBytes(maxBytes: number, options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'maxJsonBytes',
      target: target.constructor,
      propertyName,
      constraints: [maxBytes],
      options: {
        message: `${propertyName} must not exceed ${maxBytes} bytes`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          try {
            return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') <= maxBytes;
          } catch {
            // Not serialisable (for example a circular structure): not a valid payload.
            return false;
          }
        },
      },
    });
}

/**
 * Body of the public ingestion endpoint. Every field is bounded because anyone can
 * post here. Unknown top-level fields are rejected by the global `ValidationPipe`
 * (`whitelist` + `forbidNonWhitelisted`); `payload` is the one free-form field, so
 * it is capped by size instead.
 */
export class CreateLearningEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  eventId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'eventName may only contain letters, digits and . _ : -',
  })
  eventName: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  schemaVersion: number;

  @IsObject()
  @MaxJsonBytes(MAX_PAYLOAD_BYTES)
  payload: Record<string, unknown>;
}
