import request from 'supertest';

function decodeBufferPayload(value: unknown): string | undefined {
  if (
    value &&
    typeof value === 'object' &&
    (value as { type?: string }).type === 'Buffer' &&
    Array.isArray((value as { data?: number[] }).data)
  ) {
    return Buffer.from((value as { data: number[] }).data).toString('utf8');
  }
  return undefined;
}

/** Nest serializes raw Buffer responses as JSON in e2e supertest runs. */
export function readResponseBody(response: request.Response): string {
  const fromBody = decodeBufferPayload(response.body);
  if (fromBody) return fromBody;

  if (Buffer.isBuffer(response.body)) {
    return response.body.toString('utf8');
  }

  if (typeof response.text === 'string' && response.text.length > 0) {
    try {
      const parsed = JSON.parse(response.text) as unknown;
      const fromText = decodeBufferPayload(parsed);
      if (fromText) return fromText;
    } catch {
      // plain text body
    }
    return response.text;
  }

  return String(response.body ?? '');
}
