import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RelatedBooksService } from '../services/related-books.service';
import { Book } from '../schemas/book.schema';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';

const SRC = '507f1f77bcf86cd799439011';
const B1 = '507f1f77bcf86cd799439012';
const B2 = '507f1f77bcf86cd799439013';

function findByIdLeanExec(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const lean = jest.fn().mockReturnValue({ exec });
  const findById = jest.fn().mockReturnValue({ lean });
  return findById;
}

function findSelectLean(result: unknown[]) {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  const find = jest.fn().mockReturnValue({ select });
  return find;
}

function findSortSelectLean(result: unknown[]) {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ select });
  const find = jest.fn().mockReturnValue({ sort });
  return find;
}

describe('RelatedBooksService', () => {
  let service: RelatedBooksService;
  let bookModel: jest.Mocked<Model<Book>>;

  beforeEach(async () => {
    bookModel = { findById: jest.fn(), find: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelatedBooksService,
        { provide: getModelToken(Book.name), useValue: bookModel },
      ],
    }).compile();

    service = module.get<RelatedBooksService>(RelatedBooksService);
  });

  it('should throw when the source book does not exist', async () => {
    (bookModel.findById as jest.Mock).mockImplementation(findByIdLeanExec(null));

    await expect(service.getRelatedBooks(SRC)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('should return related books prioritising shared topic and excluding the source', async () => {
    (bookModel.findById as jest.Mock).mockImplementation(
      findByIdLeanExec({ _id: SRC, title: 'Source', topic: 'Science', format: 'ebook' }),
    );
    (bookModel.find as jest.Mock).mockImplementation(
      findSelectLean([
        { _id: B1, title: 'Alpha', author: 'A', format: 'ebook', workKey: 'w1', availableCopies: 2, topic: 'Science' },
        { _id: B2, title: 'Beta', author: 'B', format: 'physical', workKey: 'w2', availableCopies: 1, topic: 'History' },
      ]),
    );

    const result = await service.getRelatedBooks(SRC, 10);

    expect(result.items.map((i: { id: string }) => i.id)).toEqual([B1, B2]);
    const findCall = (bookModel.find as jest.Mock).mock.calls[0][0];
    expect(findCall._id.$ne).toBe(SRC);
    expect(findCall.availableCopies).toEqual({ $gt: 0 });
  });

  it('should return other books by the same author ordered by publication date', async () => {
    (bookModel.find as jest.Mock).mockImplementation(
      findSortSelectLean([
        { _id: B1, title: 'Old', author: 'Jane', format: 'ebook', workKey: 'w1', availableCopies: 2 },
        { _id: B2, title: 'New', author: 'Jane', format: 'ebook', workKey: 'w2', availableCopies: 1 },
      ]),
    );

    const result = await service.getSameAuthorBooks('Jane', 10);

    expect(result.items.map((i: { id: string }) => i.id)).toEqual([B1, B2]);
    expect(bookModel.find).toHaveBeenCalledWith({ author: 'Jane' });
  });
});
