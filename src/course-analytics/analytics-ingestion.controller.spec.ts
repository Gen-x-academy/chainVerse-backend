import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AnalyticsIngestionController,
  INGESTION_THROTTLE,
} from './analytics-ingestion.controller';
import {
  CreateLearningEventDto,
  MAX_PAYLOAD_BYTES,
} from './dto/create-learning-event.dto';

/** The same options `main.ts` applies globally. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validEvent = {
  eventId: 'evt-123',
  eventName: 'lesson.completed',
  schemaVersion: 1,
  payload: { lessonId: 'l1' },
};

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateLearningEventDto });

describe('analytics ingestion payload validation', () => {
  it('accepts a well-formed event', async () => {
    await expect(validate(validEvent)).resolves.toMatchObject(validEvent);
  });

  it('rejects unknown top-level fields', async () => {
    await expect(validate({ ...validEvent, userId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an oversized payload', async () => {
    const payload = { blob: 'x'.repeat(MAX_PAYLOAD_BYTES + 1) };

    await expect(validate({ ...validEvent, payload })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a payload right at the limit', async () => {
    const overhead = JSON.stringify({ blob: '' }).length;
    const payload = { blob: 'x'.repeat(MAX_PAYLOAD_BYTES - overhead) };

    await expect(validate({ ...validEvent, payload })).resolves.toBeDefined();
  });

  it.each([
    ['a missing eventId', { ...validEvent, eventId: undefined }],
    ['an empty eventName', { ...validEvent, eventName: '' }],
    ['an over-long eventId', { ...validEvent, eventId: 'e'.repeat(129) }],
    ['an eventName with unsafe characters', { ...validEvent, eventName: 'a b<script>' }],
    ['a non-integer schemaVersion', { ...validEvent, schemaVersion: 1.5 }],
    ['a zero schemaVersion', { ...validEvent, schemaVersion: 0 }],
    ['a non-object payload', { ...validEvent, payload: 'text' }],
    ['an array payload', { ...validEvent, payload: [1, 2] }],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('analytics ingestion rate limit', () => {
  const handler = AnalyticsIngestionController.prototype.create;

  it('overrides every named throttler with the per-IP limit', () => {
    const keys = Reflect.getMetadataKeys(handler).map(String);

    for (const name of ['guest', 'auth', 'premium', 'admin']) {
      const limitKey = keys.find((k) => k.includes('LIMIT') && k.endsWith(name));
      const ttlKey = keys.find((k) => k.includes('TTL') && k.endsWith(name));

      expect(limitKey).toBeDefined();
      expect(ttlKey).toBeDefined();
      expect(Reflect.getMetadata(limitKey as string, handler)).toBe(INGESTION_THROTTLE.limit);
      expect(Reflect.getMetadata(ttlKey as string, handler)).toBe(INGESTION_THROTTLE.ttl);
    }
  });
});
