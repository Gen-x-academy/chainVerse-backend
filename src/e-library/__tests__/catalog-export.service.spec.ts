import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CatalogExportService } from '../services/catalog-export.service';
import { Book, BookDocument } from '../schemas/book.schema';
import { ExportCatalogQueryDto, ExportFormat } from '../dto/export-catalog-query.dto';

describe('CatalogExportService', () => {
  let service: CatalogExportService;
  let bookModel: jest.Mocked<Model<BookDocument>>;

  const mockBooks = [
    {
      title: 'Dune',
      author: 'Frank Herbert',
      workKey: 'dune-frank-herbert',
      format: 'physical',
      totalCopies: 5,
      availableCopies: 3,
      coverImageUrl: 'https://example.com/dune.jpg',
    },
    {
      title: 'Neuromancer',
      author: 'William Gibson',
      workKey: 'neuromancer-william-gibson',
      format: 'ebook',
      totalCopies: 10,
      availableCopies: 10,
      coverImageUrl: '',
    },
  ];

  beforeEach(async () => {
    bookModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockBooks),
          }),
        }),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogExportService,
        { provide: getModelToken(Book.name), useValue: bookModel },
      ],
    }).compile();

    service = module.get<CatalogExportService>(CatalogExportService);
  });

  describe('exportCatalog', () => {
    it('should return JSON when format is json', async () => {
      const dto: ExportCatalogQueryDto = { format: ExportFormat.JSON };
      const result = await service.exportCatalog(dto);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect((result as any)[0].title).toBe('Dune');
    });

    it('should return CSV string when format is csv', async () => {
      const dto: ExportCatalogQueryDto = { format: ExportFormat.CSV };
      const result = await service.exportCatalog(dto);
      expect(typeof result).toBe('string');
      const csv = result as string;
      const lines = csv.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('title');
      expect(lines[1]).toContain('Dune');
    });

    it('should filter fields when fieldsToInclude is provided', async () => {
      const dto: ExportCatalogQueryDto = {
        format: ExportFormat.JSON,
        fieldsToInclude: ['title', 'author'],
      };
      const result = await service.exportCatalog(dto);
      const first = (result as Record<string, unknown>[])[0];
      expect(Object.keys(first)).toEqual(['title', 'author']);
    });

    it('should escape formula injection in CSV values', async () => {
      bookModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { title: '=SUM(A1:B2)', author: 'Test', workKey: 'k', format: 'physical', totalCopies: 1, availableCopies: 1, coverImageUrl: '' },
            ]),
          }),
        }),
      }) as any;

      const dto: ExportCatalogQueryDto = { format: ExportFormat.CSV };
      const result = await service.exportCatalog(dto);
      expect(result).toContain("'=SUM(A1:B2)");
    });

    it('should escape formula injection with +, -, @ prefixes', async () => {
      bookModel.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { title: '+cmd|', author: '-test', workKey: 'k', format: 'physical', totalCopies: 1, availableCopies: 1, coverImageUrl: '' },
            ]),
          }),
        }),
      }) as any;

      const dto: ExportCatalogQueryDto = { format: ExportFormat.CSV };
      const result = await service.exportCatalog(dto);
      expect(result).toContain("'+cmd|");
      expect(result).toContain("'-test");
    });
  });
});
