import * as Joi from 'joi';

/**
 * Joi schema that validates required environment variables at startup.
 * Pass this to ConfigModule.forRoot({ validationSchema }) so the app
 * refuses to boot when critical env vars are missing or malformed.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),
});

/**
 * Validates a plain env object against the schema and returns the coerced
 * values. Throws a descriptive error on the first violation.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const { error, value } = envValidationSchema.validate(env, {
    abortEarly: true,
    allowUnknown: true,
    stripUnknown: false,
  });

  if (error) {
    throw new Error(`Environment validation failed: ${error.message}`);
  }

  return value as Record<string, unknown>;
}
