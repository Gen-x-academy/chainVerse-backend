import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SavedList, SavedListDocument, SavedListItem } from '../schemas/saved-list.schema';
import { CreateSavedListDto, AddItemToListDto } from '../dto/saved-list.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/domain.exception';
import { isDuplicateKeyError } from '../e-library.util';

const MAX_LISTS_PER_PATRON = 20;
const MAX_ITEMS_PER_LIST = 500;

@Injectable()
export class SavedListService {
  constructor(
    @InjectModel(SavedList.name)
    private readonly listModel: Model<SavedListDocument>,
  ) {}

  async createList(patronId: string, dto: CreateSavedListDto): Promise<SavedList> {
    const count = await this.listModel.countDocuments({ patronId });
    if (count >= MAX_LISTS_PER_PATRON) {
      throw new ResourceConflictException(
        `Maximum number of lists reached (${MAX_LISTS_PER_PATRON})`,
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    try {
      const list = await new this.listModel({
        patronId,
        name: dto.name,
        isFavorite: dto.isFavorite ?? false,
        items: [],
        sortOrder: count + 1,
      }).save();
      return list;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ResourceConflictException(
          'A list with this name already exists',
          ErrorCode.BIZ_DUPLICATE_REQUEST,
        );
      }
      throw error;
    }
  }

  async listLists(patronId: string): Promise<SavedList[]> {
    return this.listModel.find({ patronId }).sort({ sortOrder: 1 }).exec();
  }

  async getList(listId: string, patronId: string): Promise<SavedListDocument> {
    const list = await this.listModel.findById(listId).exec();
    if (!list) {
      throw new ResourceNotFoundException('List not found', ErrorCode.RES_NOT_FOUND);
    }
    if (list.patronId !== patronId) {
      throw new ResourceNotFoundException('List not found', ErrorCode.RES_NOT_FOUND);
    }
    return list;
  }

  async addItem(listId: string, patronId: string, dto: AddItemToListDto): Promise<SavedList> {
    const list = await this.getList(listId, patronId);

    if (list.items.length >= MAX_ITEMS_PER_LIST) {
      throw new ResourceConflictException(
        `Maximum items per list reached (${MAX_ITEMS_PER_LIST})`,
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    const alreadyExists = list.items.some((item) => item.bookId === dto.bookId);
    if (alreadyExists) {
      throw new ResourceConflictException(
        'This book is already in the list',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    const updated = await this.listModel.findOneAndUpdate(
      { _id: listId, patronId },
      {
        $push: {
          items: {
            bookId: dto.bookId,
            addedAt: new Date(),
            note: dto.note,
          },
        },
      },
      { new: true },
    );

    return updated as SavedList;
  }

  async removeItem(listId: string, patronId: string, bookId: string): Promise<SavedList> {
    const list = await this.getList(listId, patronId);

    const updated = await this.listModel.findOneAndUpdate(
      { _id: listId, patronId },
      { $pull: { items: { bookId } } },
      { new: true },
    );

    return updated as SavedList;
  }

  async deleteList(listId: string, patronId: string): Promise<void> {
    const result = await this.listModel.deleteOne({ _id: listId, patronId }).exec();
    if (result.deletedCount === 0) {
      throw new ResourceNotFoundException('List not found', ErrorCode.RES_NOT_FOUND);
    }
  }
}
