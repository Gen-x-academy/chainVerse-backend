import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { Book, BookDocument, BookFormat } from '../schemas/book.schema';
import { CreateBookDto } from '../dto/create-book.dto';

export enum CatalogFormat {
  MARC = 'MARC',
  DUBLIN_CORE = 'DUBLIN_CORE',
  ONIX = 'ONIX',
  BIBTEX = 'BIBTEX',
  RIS = 'RIS',
}

export interface MappingVersion {
  version: string;
  format: CatalogFormat;
  validFrom: Date;
  validTo: Date | null;
}

export interface MappingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  lossyFields: string[];
}

export interface MappedBook {
  [key: string]: unknown;
}

interface FormatMeta {
  version: string;
  description: string;
}

const FORMAT_META: Record<CatalogFormat, FormatMeta> = {
  [CatalogFormat.MARC]: {
    version: '1.0',
    description:
      'MAchine-Readable Cataloging (MARC 21) - Library bibliographic standard',
  },
  [CatalogFormat.DUBLIN_CORE]: {
    version: '1.0',
    description: 'Dublin Core (ISO 15836) - Lightweight metadata standard',
  },
  [CatalogFormat.ONIX]: {
    version: '1.0',
    description:
      'ONline Information eXchange (ONIX 3.0) - Book industry metadata',
  },
  [CatalogFormat.BIBTEX]: {
    version: '1.0',
    description: 'BibTeX - BibTeX bibliographic reference format',
  },
  [CatalogFormat.RIS]: {
    version: '1.0',
    description:
      'Research Information Systems (RIS) - Citation exchange format',
  },
};

@Injectable()
export class CatalogMappingService {
  constructor(
    @InjectModel(Book.name)
    private readonly bookModel: Model<BookDocument>,
  ) {}

  async mapToFormat(
    book: BookDocument,
    format: CatalogFormat,
  ): Promise<MappedBook> {
    switch (format) {
      case CatalogFormat.MARC:
        return this.toMarc(book);
      case CatalogFormat.DUBLIN_CORE:
        return this.toDublinCore(book);
      case CatalogFormat.ONIX:
        return this.toOnix(book);
      case CatalogFormat.BIBTEX:
        return this.toBibtex(book);
      case CatalogFormat.RIS:
        return this.toRis(book);
    }
  }

  async mapFromFormat(
    data: Record<string, unknown>,
    format: CatalogFormat,
  ): Promise<CreateBookDto> {
    const validation = this.validateMapping(data, format);
    if (!validation.valid) {
      throw new Error(
        `Invalid mapping: ${validation.errors.join('; ')}`,
      );
    }

    switch (format) {
      case CatalogFormat.MARC:
        return this.fromMarc(data);
      case CatalogFormat.DUBLIN_CORE:
        return this.fromDublinCore(data);
      case CatalogFormat.ONIX:
        return this.fromOnix(data);
      case CatalogFormat.BIBTEX:
        return this.fromBibtex(data);
      case CatalogFormat.RIS:
        return this.fromRis(data);
    }
  }

  validateMapping(
    data: Record<string, unknown>,
    format: CatalogFormat,
  ): MappingValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const lossyFields: string[] = [];

    switch (format) {
      case CatalogFormat.MARC:
        this.validateMarc(data, errors, warnings, lossyFields);
        break;
      case CatalogFormat.DUBLIN_CORE:
        this.validateDublinCore(data, errors, warnings, lossyFields);
        break;
      case CatalogFormat.ONIX:
        this.validateOnix(data, errors, warnings, lossyFields);
        break;
      case CatalogFormat.BIBTEX:
        this.validateBibtex(data, errors, warnings, lossyFields);
        break;
      case CatalogFormat.RIS:
        this.validateRis(data, errors, warnings, lossyFields);
        break;
    }

    return { valid: errors.length === 0, errors, warnings, lossyFields };
  }

  async batchMapToFormat(
    books: BookDocument[],
    format: CatalogFormat,
  ): Promise<MappedBook[]> {
    return Promise.all(books.map((book) => this.mapToFormat(book, format)));
  }

  async batchMapFromFormat(
    records: Record<string, unknown>[],
    format: CatalogFormat,
  ): Promise<{
    mapped: CreateBookDto[];
    validationResults: MappingValidationResult[];
  }> {
    const validationResults: MappingValidationResult[] = [];
    const mapped: CreateBookDto[] = [];

    for (const record of records) {
      const result = this.validateMapping(record, format);
      validationResults.push(result);

      if (result.valid) {
        mapped.push(await this.mapFromFormat(record, format));
      }
    }

    return { mapped, validationResults };
  }

  getMappingVersion(format: CatalogFormat): MappingVersion {
    const meta = FORMAT_META[format];
    if (!meta) {
      throw new ResourceNotFoundException(
        `Format "${format}" is not supported`,
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }

    return {
      version: meta.version,
      format,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validTo: null,
    };
  }

  listSupportedFormats(): {
    format: CatalogFormat;
    version: string;
    description: string;
  }[] {
    return Object.values(CatalogFormat).map((format) => ({
      format,
      version: FORMAT_META[format].version,
      description: FORMAT_META[format].description,
    }));
  }

  // ── Private: Export mapping ────────────────────────────────────────────────

  private toMarc(book: BookDocument): MappedBook {
    return {
      leader: this.marcLeader(book),
      fields: {
        '020': { a: (book as any).isbn ?? null },
        '024': { a: book.workKey },
        '245': { a: book.title },
        '100': { a: book.author },
        '338': { a: this.formatToMarcFormat(book.format) },
        '650': { a: 'Library book' },
      },
    };
  }

  private toDublinCore(book: BookDocument): MappedBook {
    return {
      'dc:title': book.title,
      'dc:creator': book.author,
      'dc:subject': 'Library book',
      'dc:description': `${book.format} edition - ${book.availableCopies} of ${book.totalCopies} copies available`,
      'dc:publisher': (book as any).publisher ?? null,
      'dc:identifier': book.workKey,
      'dc:format': book.format,
      'dc:type': 'Text',
      'dc:language': (book as any).language ?? null,
    };
  }

  private toOnix(book: BookDocument): MappedBook {
    return {
      RecordReference: book.workKey,
      NotificationType: '03',
      ProductIdentifier: {
        ProductIDType: '15',
        IDValue: book.workKey,
      },
      ProductSupply: {
        Supplier: {
          SupplierRole: '01',
        },
        Market: {
          Territory: {
            RegionsIncluded: ['WORLD'],
          },
        },
      },
      Product: {
        ProductForm: this.formatToOnixForm(book.format),
        TitleDetail: {
          TitleType: '01',
          TitleElement: {
            TitleElementLevel: '01',
            TitleText: { collationkey: book.title.toLowerCase(), content: book.title },
          },
        },
        Contributor: {
          SequenceNumber: 1,
          ContributorRole: { a09: 'Author' },
          PersonName: { content: book.author },
        },
        NumberOfCopies: book.totalCopies,
        NumberOfCopiesAvailable: book.availableCopies,
      },
    };
  }

  private toBibtex(book: BookDocument): MappedBook {
    const escaped = (s: string) => s.replace(/[{}&%#_\\^~]/g, '\\$&');

    return {
      entryType: 'book',
      key: book.workKey,
      fields: {
        title: `{${escaped(book.title)}}`,
        author: book.author,
        publisher: (book as any).publisher ?? 'Unknown',
        year: (book as any).year ?? new Date().getFullYear(),
        isbn: (book as any).isbn ?? null,
        note: `Format: ${book.format}, Available: ${book.availableCopies}/${book.totalCopies}`,
      },
    };
  }

  private toRis(book: BookDocument): MappedBook {
    const entries: string[] = [
      'TY  - BOOK',
      `TI  - ${book.title}`,
      `AU  - ${book.author}`,
      `PY  - ${(book as any).year ?? new Date().getFullYear()}`,
      `DA  - ${new Date().toISOString().split('T')[0]}`,
    ];

    if ((book as any).publisher) {
      entries.push(`PB  - ${(book as any).publisher}`);
    }
    if ((book as any).isbn) {
      entries.push(`SN  - ${(book as any).isbn}`);
    }

    entries.push(`N1  - Format: ${book.format}`);
    entries.push(`N2  - Available: ${book.availableCopies}/${book.totalCopies}`);
    entries.push(`UR  - ${book.workKey}`);
    entries.push('ER  -');

    return { ris: entries.join('\n'), key: book.workKey };
  }

  // ── Private: Import mapping ────────────────────────────────────────────────

  private fromMarc(data: Record<string, unknown>): CreateBookDto {
    const fields = (data.fields ?? {}) as Record<string, any>;
    return {
      title: String(fields['245']?.a ?? ''),
      author: String(fields['100']?.a ?? ''),
      workKey: String(fields['024']?.a ?? ''),
      format: this.marcFormatToBookFormat(fields['338']?.a),
      totalCopies: Number(data.totalCopies ?? 1),
    };
  }

  private fromDublinCore(data: Record<string, unknown>): CreateBookDto {
    return {
      title: String(data['dc:title'] ?? ''),
      author: String(data['dc:creator'] ?? ''),
      workKey: String(data['dc:identifier'] ?? ''),
      format: this.normalizeFormat(data['dc:format']),
      totalCopies: Number(data.totalCopies ?? 1),
    };
  }

  private fromOnix(data: Record<string, unknown>): CreateBookDto {
    const product = (data.Product ?? {}) as Record<string, any>;
    const titleDetail = (product.TitleDetail ?? {}) as Record<string, any>;
    const titleElement = (titleDetail.TitleElement ?? {}) as Record<string, any>;
    const titleText = (titleElement.TitleText ?? {}) as Record<string, any>;
    const contributors = Array.isArray(product.Contributor)
      ? product.Contributor[0]
      : (product.Contributor ?? {});
    const productIdentifier = (data.ProductIdentifier ?? {}) as Record<string, any>;

    return {
      title: String(titleText.content ?? ''),
      author: String(contributors.PersonName?.content ?? ''),
      workKey: String(
        productIdentifier.IDValue ?? (data.RecordReference as string) ?? '',
      ),
      format: this.onixFormToBookFormat(product.ProductForm),
      totalCopies: Number(product.NumberOfCopies ?? 1),
    };
  }

  private fromBibtex(data: Record<string, unknown>): CreateBookDto {
    const fields = (data.fields ?? {}) as Record<string, string>;

    const unescape = (s: string) =>
      s.replace(/^{|}$/g, '').replace(/\\([{}&%#_\\^~])/g, '$1');

    return {
      title: unescape(String(fields.title ?? '')),
      author: String(fields.author ?? ''),
      workKey: String((data.key as string) ?? ''),
      format: BookFormat.PHYSICAL,
      totalCopies: 1,
    };
  }

  private fromRis(data: Record<string, unknown>): CreateBookDto {
    const risString = String(data.ris ?? '');
    const parsed: Record<string, string> = {};

    for (const line of risString.split('\n')) {
      const match = line.match(/^([A-Z]{2})\s+-\s+(.+)$/);
      if (match) {
        const [, tag, value] = match;
        if (tag === 'ER') break;
        if (parsed[tag]) {
          parsed[tag] += `; ${value}`;
        } else {
          parsed[tag] = value;
        }
      }
    }

    return {
      title: String(parsed.TI ?? ''),
      author: String(parsed.AU ?? ''),
      workKey: String(parsed.UR ?? parsed.DO ?? ''),
      format: BookFormat.PHYSICAL,
      totalCopies: 1,
    };
  }

  // ── Private: Validation ────────────────────────────────────────────────────

  private validateMarc(
    data: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    lossyFields: string[],
  ): void {
    const fields = data.fields as Record<string, unknown> | undefined;
    if (!fields || typeof fields !== 'object') {
      errors.push('MARC record must contain a "fields" object');
      return;
    }

    if (!fields['245'] || !(fields['245'] as any).a) {
      errors.push('MARC field 245$a (title) is required');
    }
    if (!fields['100'] || !(fields['100'] as any).a) {
      errors.push('MARC field 100$a (author) is required');
    }
    if (!fields['024'] || !(fields['024'] as any).a) {
      warnings.push('MARC field 024$a (identifier/workKey) is missing - will generate');
    }
    if (!fields['338']) {
      warnings.push('MARC field 338 (format) is missing - defaulting to physical');
    }

    lossyFields.push(
      '020$a (isbn) - no isbn field in source schema',
      '650$a (subject) - no subject field in source schema',
    );
  }

  private validateDublinCore(
    data: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    lossyFields: string[],
  ): void {
    if (!data['dc:title']) errors.push('dc:title is required');
    if (!data['dc:creator']) errors.push('dc:creator is required');
    if (!data['dc:identifier']) {
      warnings.push('dc:identifier is missing - will use workKey');
    }

    lossyFields.push(
      'dc:publisher - no publisher field in source schema',
      'dc:language - no language field in source schema',
    );
  }

  private validateOnix(
    data: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    lossyFields: string[],
  ): void {
    if (!data.RecordReference) errors.push('RecordReference is required');
    const product = data.Product as Record<string, unknown> | undefined;
    if (!product) {
      errors.push('Product object is required');
      return;
    }

    const titleDetail = product.TitleDetail as Record<string, unknown> | undefined;
    if (!titleDetail?.TitleElement) {
      errors.push('Product.TitleDetail.TitleElement is required');
    }

    const contributor = product.Contributor as Record<string, unknown> | undefined;
    if (!contributor?.PersonName) {
      errors.push('Product.Contributor.PersonName is required');
    }

    lossyFields.push(
      'Product.Classification - no BISAC/subject in source schema',
      'Product.Language - no language field in source schema',
    );
  }

  private validateBibtex(
    data: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    lossyFields: string[],
  ): void {
    if (!data.key) errors.push('BibTeX entry key is required');
    const fields = data.fields as Record<string, unknown> | undefined;
    if (!fields) {
      errors.push('BibTeX record must contain a "fields" object');
      return;
    }

    if (!fields.title) errors.push('title field is required');
    if (!fields.author) errors.push('author field is required');
    if (!fields.year) {
      warnings.push('year field is missing - will default to current year');
    }
    if (!fields.publisher) {
      warnings.push('publisher field is missing - will default to "Unknown"');
    }

    lossyFields.push(
      'journal - no journal field in source schema',
      'volume/number - no volume/number fields in source schema',
      'pages - no page count in source schema',
      'doi - no DOI in source schema',
    );
  }

  private validateRis(
    data: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    lossyFields: string[],
  ): void {
    const risString = data.ris as string | undefined;
    if (!risString || typeof risString !== 'string') {
      errors.push('RIS data must contain a "ris" string');
      return;
    }

    const parsed: Record<string, boolean> = {};
    for (const line of risString.split('\n')) {
      const match = line.match(/^([A-Z]{2})\s+-\s+/);
      if (match) parsed[match[1]] = true;
    }

    if (!parsed.TI) errors.push('TI (title) tag is required');
    if (!parsed.AU) errors.push('AU (author) tag is required');
    if (!parsed.PY) warnings.push('PY (publication year) tag is missing');
    if (!parsed.UR) warnings.push('UR (URL/identifier) tag is missing');

    lossyFields.push(
      'PB (publisher) - may not be available in all RIS records',
      'DO (DOI) - no DOI in source schema',
      'KW (keywords) - no keyword field in source schema',
    );
  }

  // ── Private: Format helpers ────────────────────────────────────────────────

  private formatToMarcFormat(format: BookFormat): string {
    const map: Record<BookFormat, string> = {
      [BookFormat.PHYSICAL]: 'unmediated',
      [BookFormat.EBOOK]: 'computer',
      [BookFormat.AUDIOBOOK]: 'audio',
    };
    return map[format] ?? 'unmediated';
  }

  private marcLeader(book: BookDocument): string {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const type = 'a';
    const bibLevel = 'm';
    const recordStatus = 'n';
    const controlType = ' ';

    const fieldsPart = `00000nam${recordStatus}${controlType}${bibLevel}2200000${type}  4500`;
    return fieldsPart;
  }

  private formatToOnixForm(format: BookFormat): string {
    const map: Record<BookFormat, string> = {
      [BookFormat.PHYSICAL]: 'BC',
      [BookFormat.EBOOK]: 'ED',
      [BookFormat.AUDIOBOOK]: 'AB',
    };
    return map[format] ?? 'BC';
  }

  private normalizeFormat(raw: unknown): BookFormat {
    const value = String(raw ?? '').toLowerCase();
    if (value.includes('ebook') || value === 'ed' || value === 'computer') {
      return BookFormat.EBOOK;
    }
    if (value.includes('audio') || value === 'ab') {
      return BookFormat.AUDIOBOOK;
    }
    return BookFormat.PHYSICAL;
  }

  private onixFormToBookFormat(form: unknown): BookFormat {
    const value = String(form ?? '').toUpperCase();
    if (value === 'ED' || value === 'EBOOK') return BookFormat.EBOOK;
    if (value === 'AB' || value === 'AUDIOBOOK') return BookFormat.AUDIOBOOK;
    return BookFormat.PHYSICAL;
  }

  private marcFormatToBookFormat(value: unknown): BookFormat {
    const v = String(value ?? '').toLowerCase();
    if (v.includes('computer') || v.includes('electronic')) return BookFormat.EBOOK;
    if (v.includes('audio')) return BookFormat.AUDIOBOOK;
    return BookFormat.PHYSICAL;
  }
}
