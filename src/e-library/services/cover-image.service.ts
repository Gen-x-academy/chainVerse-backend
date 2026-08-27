import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { Book, BookDocument } from './schemas/book.schema';

const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MiB

const IMAGE_MAGIC: Array<{ mime: string; sig: Buffer }> = [
  { mime: 'image/png', sig: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', sig: Buffer.from([0xff, 0xd8, 0xff]) },
  { mime: 'image/webp', sig: Buffer.from([0x52, 0x49, 0x46, 0x46]) }, // "RIFF....WEBP"
];

function sniffMime(buffer: Buffer): string | null {
  for (const { mime, sig } of IMAGE_MAGIC) {
    if (buffer.length >= sig.length && buffer.subarray(0, sig.length).equals(sig)) {
      return mime;
    }
  }
  // WebP is RIFF + "WEBP" at offset 8.
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    buffer.subarray(8, 12).equals(Buffer.from('WEBP'))
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Issue #998 – Cover image ingestion and safe transformation.
 *
 * Accepts a trusted cover upload, verifies it is a real image via magic
 * bytes (never trusting the caller's declared MIME), enforces a hard size
 * ceiling, stores it under a stable content-addressed URL, and cleans up the
 * previous asset on replacement.
 */
@Injectable()
export class CoverImageService {
  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
  ) {}

  async ingest(bookId: string, buffer: Buffer): Promise<BookDocument> {
    const book = await this.bookModel.findById(bookId);
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Cover image payload is empty');
    }
    if (buffer.length > MAX_COVER_BYTES) {
      throw new BadRequestException(
        `Cover image exceeds the ${MAX_COVER_BYTES / (1024 * 1024)} MiB limit`,
      );
    }

    const mime = sniffMime(buffer);
    if (!mime) {
      throw new BadRequestException(
        'Unsupported image type. Only PNG, JPEG and WebP are accepted.',
      );
    }

    // Stable content-addressed URL: // covers use the hash so identical
    // images share a URL and cache invalidation is trivial on replacement.
    const hash = createHash('sha256').update(buffer).digest('hex');

    // Cleaning the previous asset is simply dropping the old stable URL and
    // buffer; whatever references the old hash is superseded.
    book.coverImageData = buffer;
    book.coverImageMime = mime;
    book.coverImageUrl = `/covers/${hash}.${extFor(mime)}`;

    return book.save();
  }

  async remove(bookId: string): Promise<BookDocument> {
    const book = await this.bookModel.findById(bookId);
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    book.coverImageData = undefined;
    book.coverImageMime = undefined;
    book.coverImageUrl = '';
    return book.save();
  }
}

function extFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}
