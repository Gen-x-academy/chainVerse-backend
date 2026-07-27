import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ParseObjectIdPipe } from './parse-object-id.pipe';

const metadata = (data?: string): ArgumentMetadata => ({
  type: 'param',
  metatype: String,
  data,
});

describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe();

  it('passes a well-formed ObjectId through unchanged', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(pipe.transform(id, metadata('id'))).toBe(id);
  });

  it.each([
    ['not-an-object-id', 'free text'],
    ['507f1f77bcf86cd79943901', 'one hex digit short'],
    ['507f1f77bcf86cd799439011x', 'trailing junk'],
    ['', 'empty string'],
    ['../../etc/passwd', 'path traversal attempt'],
  ])('rejects %s (%s) with 400 before Mongoose sees it', (value) => {
    expect(() => pipe.transform(value, metadata('courseId'))).toThrow(
      BadRequestException,
    );
  });

  it('names the offending parameter in the message', () => {
    expect(() => pipe.transform('nope', metadata('tutorId'))).toThrow(
      'tutorId must be a valid ObjectId',
    );
  });

  it('falls back to "id" when the parameter name is unknown', () => {
    expect(() => pipe.transform('nope', metadata())).toThrow(
      'id must be a valid ObjectId',
    );
  });

  it('rejects a 12-character string that Mongoose would otherwise cast', () => {
    // Mongoose accepts any 12-byte string as an ObjectId, which turns an
    // arbitrary path segment into a silent lookup miss instead of a 400.
    expect(() => pipe.transform('abcdefghijkl', metadata('id'))).toThrow(
      BadRequestException,
    );
  });
});
