import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform, ParseObjectIdPipe } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!isValidObjectId(value)) {
      const parameterName = metadata.data ?? 'id';
      throw new BadRequestException(`${parameterName} must be a valid ObjectId`);
    }

    return value;
  }
}
