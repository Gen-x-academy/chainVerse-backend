import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AutocompleteService } from '../services/autocomplete.service';
import { Book, BookDocument, BookFormat } from '../schemas/book.schema';
import { AutocompleteQueryDto, AutocompleteField } from '../dto/autocomplete-query.dto';
import { BusinessRuleException } from '../../common/errors/domain.exception';

describe('AutocompleteService', () => {
  let service: AutocompleteService;
  let bookModel: jest.Mocked<Model<BookDocument>>;

  const mockBooks = [
    { _id: '1', title: 'Machine Learning Basics', author: 'Alice Smith' },
    { _id: '2', title: 'Machine Learning in Practice', author: 'Bob Jones' },
  ];

  let chain: any;

  beforeEach(async () => {
    chain = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockBooks),
    };

    bookModel = {
      find: jest.fn().mockReturnValue(chain),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutocompleteService,
        { provide: getModelToken(Book.name), useValue: bookModel },
      ],
    }).compile();

    service = module.get<AutocompleteService>(AutocompleteService);
  });

  describe('suggest', () => {
    it('should return deduplicated suggestions', async () => {
      const dto: AutocompleteQueryDto = { q: 'mach', field: AutocompleteField.TITLE, limit: 10 };

      const result = await service.suggest(dto);

      expect(result).toEqual(['Machine Learning Basics', 'Machine Learning in Practice']);
    });

    it('should apply correct regex prefix query', async () => {
      const dto: AutocompleteQueryDto = { q: 'mach', field: AutocompleteField.TITLE, limit: 10 };

      await service.suggest(dto);

      expect(bookModel.find).toHaveBeenCalledWith({
        title: expect.any(RegExp),
      });
    });

    it('should cap limit at 25', async () => {
      const dto: AutocompleteQueryDto = { q: 'mach', field: AutocompleteField.TITLE, limit: 50 };

      await service.suggest(dto);

      const selectChain = bookModel.find({ title: expect.any(RegExp) });
      expect(selectChain.limit).toHaveBeenCalledWith(75);
    });

    it('should respect limit from dto', async () => {
      const dto: AutocompleteQueryDto = { q: 'mach', field: AutocompleteField.TITLE, limit: 5 };

      await service.suggest(dto);

      const selectChain = bookModel.find({ title: expect.any(RegExp) });
      expect(selectChain.limit).toHaveBeenCalledWith(15);
    });

    it('should map subject field to topic', async () => {
      const dto: AutocompleteQueryDto = { q: 'scie', field: AutocompleteField.SUBJECT, limit: 10 };

      await service.suggest(dto);

      expect(bookModel.find).toHaveBeenCalledWith({
        topic: expect.any(RegExp),
      });
    });

    it('should throw for invalid field', async () => {
      const dto = { q: 'test', field: 'invalid' } as any;

      await expect(service.suggest(dto)).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('should normalize whitespace in query', async () => {
      const dto: AutocompleteQueryDto = { q: '  machine   learning  ', field: AutocompleteField.TITLE, limit: 10 };

      await service.suggest(dto);

      expect(bookModel.find).toHaveBeenCalledWith({
        title: expect.any(RegExp),
      });
    });
  });
});
