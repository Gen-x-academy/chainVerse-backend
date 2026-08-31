import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SeriesService } from '../services/series.service';
import { Series } from '../schemas/series.schema';
import { Book } from '../schemas/book.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';

const SRC = '507f1f77bcf86cd799439011';
const SERIES_A = '507f1f77bcf86cd799439012';
const SERIES_B = '507f1f77bcf86cd799439013';
const B1 = '507f1f77bcf86cd799439021';
const B2 = '507f1f77bcf86cd799439022';
const B3 = '507f1f77bcf86cd799439023';

function findByIdExec(result: unknown) {
  const exec = jest.fn().mockResolvedValue(result);
  const findById = jest.fn().mockReturnValue({ exec });
  return findById;
}

function findSelectLean(result: unknown[]) {
  const lean = jest.fn().mockResolvedValue(result);
  const select = jest.fn().mockReturnValue({ lean });
  const find = jest.fn().mockReturnValue({ select });
  return find;
}

function mockBookDocument(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: B1,
    title: 'Book',
    seriesId: null,
    volumeNumber: undefined,
    volumeLabel: undefined,
    save: jest.fn(),
    ...overrides,
  };
  (doc.save as jest.Mock).mockResolvedValue(doc);
  return doc;
}

describe('SeriesService', () => {
  let service: SeriesService;
  let seriesModel: jest.Mocked<Model<Series>>;
  let bookModel: jest.Mocked<Model<Book>>;
  let paginationService: jest.Mocked<PaginationService>;

  beforeEach(async () => {
    seriesModel = {
      create: jest.fn(),
      findById: jest.fn(),
    } as any;
    bookModel = {
      findById: jest.fn(),
      find: jest.fn(),
    } as any;
    paginationService = { paginate: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeriesService,
        { provide: getModelToken(Series.name), useValue: seriesModel },
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<SeriesService>(SeriesService);
  });

  it('should create a series', async () => {
    const created = { _id: SERIES_A, name: 'My Series', description: '' };
    (seriesModel.create as jest.Mock).mockResolvedValue(created);

    const result = await service.createSeries({ name: 'My Series' });

    expect(seriesModel.create).toHaveBeenCalledWith({
      name: 'My Series',
      description: '',
    });
    expect(result).toEqual(created);
  });

  it('should throw a conflict when the series name is a duplicate', async () => {
    (seriesModel.create as jest.Mock).mockRejectedValue({ code: 11000 });

    await expect(
      service.createSeries({ name: 'Duplicate' }),
    ).rejects.toThrow(ResourceConflictException);
  });

  it('should throw a not-found when a series does not exist', async () => {
    (seriesModel.findById as jest.Mock).mockImplementation(findByIdExec(null));

    await expect(service.findOne(SERIES_A)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('should assign a book to a series and set its volume', async () => {
    (seriesModel.findById as jest.Mock).mockImplementation(
      findByIdExec({ _id: SERIES_A, name: 'S' }),
    );
    const bookDoc = mockBookDocument();
    (bookModel.findById as jest.Mock).mockImplementation(findByIdExec(bookDoc));

    const result = await service.assignBookToSeries(B1, {
      seriesId: SERIES_A,
      volumeNumber: 1.5,
    });

    expect(String(bookDoc.seriesId)).toBe(SERIES_A);
    expect(bookDoc.volumeNumber).toBe(1.5);
    expect(bookDoc.save).toHaveBeenCalled();
    expect(result).toBe(bookDoc);
  });

  it('should throw when assigning to a different series', async () => {
    (seriesModel.findById as jest.Mock).mockImplementation(
      findByIdExec({ _id: SERIES_B, name: 'Other' }),
    );
    const bookDoc = mockBookDocument({ seriesId: SERIES_A });
    (bookModel.findById as jest.Mock).mockImplementation(findByIdExec(bookDoc));

    await expect(
      service.assignBookToSeries(B1, { seriesId: SERIES_B }),
    ).rejects.toThrow(BusinessRuleException);
  });

  it('should return books in a series ordered by volume with prev/next', async () => {
    (seriesModel.findById as jest.Mock).mockImplementation(
      findByIdExec({ _id: SERIES_A, name: 'S', description: '' }),
    );
    (bookModel.find as jest.Mock).mockImplementation(
      findSelectLean([
        { _id: B3, title: 'Prologue', author: 'A', format: 'ebook', workKey: 'w', volumeLabel: 'Prologue', availableCopies: 1 },
        { _id: B1, title: 'Vol 1.5', author: 'A', format: 'ebook', workKey: 'w', volumeNumber: 1.5, availableCopies: 1 },
        { _id: B2, title: 'Vol 2', author: 'A', format: 'ebook', workKey: 'w', volumeNumber: 2, availableCopies: 1 },
      ]),
    );

    const result = await service.getSeriesBooks(SERIES_A);

    expect(result.items.map((i: { id: string }) => i.id)).toEqual([
      B1,
      B2,
      B3,
    ]);
    expect(result.items[0].previousVolume).toBeNull();
    expect(result.items[0].nextVolume.id).toBe(B2);
    expect(result.items[2].nextVolume).toBeNull();
  });
});
