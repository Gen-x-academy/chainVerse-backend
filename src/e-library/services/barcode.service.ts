import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from './schemas/book-copy.schema';
import { isDuplicateKeyError } from './e-library.util';

@Injectable()
export class BarcodeService {
  constructor(
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
  ) {}

  async assignBarcode(copyId: string, customBarcode?: string): Promise<BookCopy> {
    const copy = await this.bookCopyModel.findById(copyId);
    if (!copy) {
      throw new NotFoundException('Book copy not found');
    }

    const barcode = customBarcode ?? this.generateBarcode();

    try {
      const updated = await this.bookCopyModel.findOneAndUpdate(
        { _id: copyId },
        { $set: { barcode } },
        { new: true },
      );
      return updated as BookCopy;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(`Barcode "${barcode}" is already assigned to another copy`);
      }
      throw error;
    }
  }

  async reassignBarcode(copyId: string, newBarcode: string, reason: string): Promise<BookCopy> {
    const copy = await this.bookCopyModel.findById(copyId);
    if (!copy) {
      throw new NotFoundException('Book copy not found');
    }

    if (copy.status === CopyPhysicalStatus.CHECKED_OUT) {
      throw new BadRequestException('Cannot reassign barcode while copy is checked out');
    }

    const existing = await this.bookCopyModel.findOne({ barcode: newBarcode, _id: { $ne: copyId } });
    if (existing) {
      throw new ConflictException(`Barcode "${newBarcode}" is already assigned to another copy`);
    }

    const updated = await this.bookCopyModel.findOneAndUpdate(
      { _id: copyId },
      { $set: { barcode: newBarcode } },
      { new: true },
    );
    return updated as BookCopy;
  }

  async findByBarcode(barcode: string): Promise<BookCopyDocument> {
    const copy = await this.bookCopyModel.findOne({ barcode }).exec();
    if (!copy) {
      throw new NotFoundException(`No copy found with barcode "${barcode}"`);
    }
    return copy;
  }

  async validateBarcodeAvailable(barcode: string): Promise<boolean> {
    const existing = await this.bookCopyModel.findOne({ barcode }).exec();
    return !existing;
  }

  private generateBarcode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `LIB-${timestamp}-${random}`;
  }
}
