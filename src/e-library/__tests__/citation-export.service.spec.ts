import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CitationExportService } from '../services/citation-export.service';
import { formatCitation, CitationSource } from '../services/citation-formatter';
import { CitationFormat } from '../dto/citation-export-query.dto';
import { Book } from '../schemas/book.schema';
import { SavedList } from '../schemas/saved-list.schema';
import { ForbiddenDomainException, ResourceNotFoundException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const SOURCE: CitationSource = {
  bookId: '64b8f0a1c2d3e4f5a6b7c8d9',
  workKey: 'dune-frank-herbert',
  title: 'Dune',
  author: 'Frank Herbert',
  publisher: 'Chilton Books',
  publicationYear: 1965,
  editionLabel: '50th Anniversary ed.',
  isbn: '9780441013593',
};

describe('citation-formatter', () => {
  describe('deterministic output', () => {
    it('produces identical output for identical input in every style', () => {
      for (const format of Object.values(CitationFormat)) {
        const first = formatCitation(format, SOURCE);
        const second = formatCitation(format, SOURCE);
        expect(first.citation).toBe(second.citation);
      }
    });
  });

  describe('APA', () => {
    it('renders edition-aware citation with full metadata', () => {
      const result = formatCitation(CitationFormat.APA, SOURCE);
      expect(result.citation).toBe(
        'Frank Herbert. (1965). Dune (50th Anniversary ed.). Chilton Books.',
      );
      expect(result.usedEdition).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('reports missing publisher and year and renders placeholders', () => {
      const result = formatCitation(CitationFormat.APA, {
        ...SOURCE,
        publisher: '',
        publicationYear: undefined,
      });
      expect(result.citation).toBe('Frank Herbert. (n.d.). Dune (50th Anniversary ed.).');
      expect(result.missing).toEqual(['publisher', 'publicationYear']);
    });
  });

  describe('MLA', () => {
    it('renders edition-aware citation with full metadata', () => {
      const result = formatCitation(CitationFormat.MLA, SOURCE);
      expect(result.citation).toBe(
        'Frank Herbert. Dune, 50th Anniversary ed. Chilton Books, 1965.',
      );
    });

    it('renders n.d. when the year is missing', () => {
      const result = formatCitation(CitationFormat.MLA, {
        ...SOURCE,
        publicationYear: undefined,
      });
      expect(result.citation).toBe(
        'Frank Herbert. Dune, 50th Anniversary ed. Chilton Books, n.d.',
      );
    });
  });

  describe('Chicago', () => {
    it('renders edition-aware citation with full metadata', () => {
      const result = formatCitation(CitationFormat.CHICAGO, SOURCE);
      expect(result.citation).toBe(
        'Frank Herbert. Dune. 50th Anniversary ed. Chilton Books, 1965.',
      );
    });

    it('omits missing publisher and reports it', () => {
      const result = formatCitation(CitationFormat.CHICAGO, {
        ...SOURCE,
        publisher: '',
      });
      expect(result.citation).toBe('Frank Herbert. Dune. 50th Anniversary ed. 1965.');
      expect(result.missing).toContain('publisher');
    });
  });

  describe('BibTeX', () => {
    it('escapes special characters and builds a deterministic @book entry', () => {
      const result = formatCitation(CitationFormat.BIBTEX, {
        ...SOURCE,
        title: 'Birds & Bees {Illustrated}',
        publisher: 'Press & Co',
      });
      expect(result.citation).toContain('@book{dune-frank-herbert,');
      expect(result.citation).toContain('title     = {Birds \\& Bees \\{Illustrated\\}}');
      expect(result.citation).toContain('publisher = {Press \\& Co}');
      expect(result.citation).toContain('isbn      = {9780441013593}');
    });

    it('omits absent optional fields and reports isbn+year', () => {
      const result = formatCitation(CitationFormat.BIBTEX, {
        ...SOURCE,
        isbn: '',
        publicationYear: undefined,
        editionLabel: '',
      });
      expect(result.citation).not.toContain('year      = {');
      expect(result.citation).not.toContain('isbn      = {');
      expect(result.missing).toEqual(['publicationYear', 'isbn']);
    });
  });

  describe('RIS', () => {
    it('renders deterministic tagged lines', () => {
      const result = formatCitation(CitationFormat.RIS, SOURCE);
      expect(result.citation).toContain('TY  - BOOK\n');
      expect(result.citation).toContain('AU  - Frank Herbert');
      expect(result.citation).toContain('TI  - Dune');
      expect(result.citation).toContain('PB  - Chilton Books');
      expect(result.citation).toContain('PY  - 1965');
      expect(result.citation).toContain('ET  - 50th Anniversary ed.');
      expect(result.citation).toContain('SN  - 9780441013593');
      expect(result.citation.endsWith('ER  - ')).toBe(true);
    });
  });
});

describe('CitationExportService', () => {
  let service: CitationExportService;
  let bookModel: jest.Mocked<Model<any>>;
  let savedListModel: jest.Mocked<Model<any>>;

  const dune = {
    _id: '64b8f0a1c2d3e4f5a6b7c8d9',
    workKey: 'dune-frank-herbert',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'Chilton Books',
    publicationYear: 1965,
    editionLabel: '50th Anniversary ed.',
    isbn: '9780441013593',
  };
  const duneMessiah = {
    _id: '64b8f0a1c2d3e4f5a6b7c8e0',
    workKey: 'dune-messiah-frank-herbert',
    title: 'Dune Messiah',
    author: 'Frank Herbert',
    publisher: 'Putnam',
    publicationYear: 1969,
    editionLabel: '',
    isbn: '',
  };

  beforeEach(async () => {
    bookModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([dune, duneMessiah]) }),
      }),
    } as any;
    savedListModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CitationExportService,
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(SavedList.name), useValue: savedListModel },
      ],
    }).compile();

    service = module.get<CitationExportService>(CitationExportService);
  });

  describe('exportCatalogCitations', () => {
    it('returns citations in the requested order', async () => {
      const result = await service.exportCatalogCitations(
        ['64b8f0a1c2d3e4f5a6b7c8e0', '64b8f0a1c2d3e4f5a6b7c8d9'],
        CitationFormat.APA,
      );
      expect(result.citations.map((c) => c.bookId)).toEqual([
        '64b8f0a1c2d3e4f5a6b7c8e0',
        '64b8f0a1c2d3e4f5a6b7c8d9',
      ]);
      expect(result.citations[0].citation).toContain('(1969)');
      expect(result.citations[1].citation).toContain('(1965)');
    });

    it('returns an empty list for no ids', async () => {
      const result = await service.exportCatalogCitations([], CitationFormat.RIS);
      expect(result.citations).toEqual([]);
    });

    it('throws 404 listing unknown ids', async () => {
      bookModel.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([duneMessiah]),
        }),
      }) as any;

      try {
        await service.exportCatalogCitations(
          ['64b8f0a1c2d3e4f5a6b7c8d9', '64b8f0a1c2d3e4f5a6b7c8e0'],
          CitationFormat.MLA,
        );
        fail('expected ResourceNotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(ResourceNotFoundException);
        expect(err.getStatus()).toBe(404);
        expect(err.errorCode).toBe(ErrorCode.RES_BOOK_NOT_FOUND);
        expect(err.message).toContain('64b8f0a1c2d3e4f5a6b7c8d9');
      }
    });
  });

  describe('exportReadingListCitations', () => {
    it('rejects a list owned by another patron', async () => {
      savedListModel.findById = jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              _id: '64b8f0a1c2d3e4f5a6b7c8f0',
              patronId: 'owner-A',
              items: [{ bookId: '64b8f0a1c2d3e4f5a6b7c8d9' }],
            }),
          }),
      }) as any;

      try {
        await service.exportReadingListCitations(
          '64b8f0a1c2d3e4f5a6b7c8f0',
          'owner-B',
          CitationFormat.APA,
        );
        fail('expected ForbiddenDomainException');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenDomainException);
        expect(err.getStatus()).toBe(403);
        expect(err.errorCode).toBe(ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS);
      }
    });

    it('throws 404 when the list does not exist', async () => {
      try {
        await service.exportReadingListCitations(
          '64b8f0a1c2d3e4f5a6b7c8f0',
          'owner-A',
          CitationFormat.BIBTEX,
        );
        fail('expected ResourceNotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(ResourceNotFoundException);
        expect(err.getStatus()).toBe(404);
      }
    });

    it('renders citations for the owner in item order', async () => {
      savedListModel.findById = jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              _id: '64b8f0a1c2d3e4f5a6b7c8f0',
              patronId: 'owner-A',
              items: [
                { bookId: '64b8f0a1c2d3e4f5a6b7c8e0' },
                { bookId: '64b8f0a1c2d3e4f5a6b7c8d9' },
              ],
            }),
          }),
      }) as any;

      const result = await service.exportReadingListCitations(
        '64b8f0a1c2d3e4f5a6b7c8f0',
        'owner-A',
        CitationFormat.MLA,
      );
      expect(result.citations.map((c) => c.bookId)).toEqual([
        '64b8f0a1c2d3e4f5a6b7c8e0',
        '64b8f0a1c2d3e4f5a6b7c8d9',
      ]);
      expect(result.citations[0].citation).toContain('Dune Messiah');
      expect(result.citations[1].citation).toContain('Dune, 50th Anniversary ed.');
    });
  });
});