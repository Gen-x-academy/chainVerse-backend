import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/**
 * The canonical wire form of an ObjectId.
 *
 * `isValidObjectId` alone also accepts any 12-character string, which lets an
 * arbitrary path segment be cast into an id and turn into a silent lookup miss
 * instead of a 400. Route parameters always carry the 24-character hex form,
 * so anything else is rejected at the edge.
 */
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (
      typeof value !== 'string' ||
      !OBJECT_ID_PATTERN.test(value) ||
      !isValidObjectId(value)
    ) {
      const parameterName = metadata.data ?? 'id';
      throw new BadRequestException(
        `${parameterName} must be a valid ObjectId`,
      );
    }

    return value;
  }
}
