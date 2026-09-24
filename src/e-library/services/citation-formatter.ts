import { CitationFormat } from '../dto/citation-export-query.dto';

export interface CitationSource {
  bookId: string;
  workKey?: string;
  title?: string;
  author?: string;
  publisher?: string;
  publicationYear?: number;
  editionLabel?: string;
  volumeLabel?: string;
  isbn?: string;
}

export type MissingCitationField =
  | 'author'
  | 'title'
  | 'publisher'
  | 'publicationYear'
  | 'isbn';

export interface FormatCitationResult {
  citation: string;
  missing: MissingCitationField[];
  usedEdition: boolean;
}

const AUTHOR_PLACEHOLDER = 'Unknown author';
const TITLE_PLACEHOLDER = '[Untitled]';
const NO_DATE_PLACEHOLDER = 'n.d.';

function normalize(value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function isDefined(value: string | undefined | number): value is string | number {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function yearLabel(source: CitationSource): string {
  return isDefined(source.publicationYear) ? String(source.publicationYear) : '';
}

function missingFields(
  source: CitationSource,
  format: CitationFormat,
): MissingCitationField[] {
  const missing: MissingCitationField[] = [];
  if (!normalize(source.author)) missing.push('author');
  if (!normalize(source.title)) missing.push('title');
  if (!normalize(source.publisher)) missing.push('publisher');
  if (!isDefined(source.publicationYear)) missing.push('publicationYear');
  if (
    (format === CitationFormat.BIBTEX || format === CitationFormat.RIS) &&
    !normalize(source.isbn)
  ) {
    missing.push('isbn');
  }
  return missing;
}

function bibTexEscape(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\$/g, '\\$')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function bibTexKey(source: CitationSource): string {
  const base = isDefined(source.workKey) ? String(source.workKey) : source.bookId;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : source.bookId;
}

function formAuthor(source: CitationSource): string {
  return normalize(source.author) || AUTHOR_PLACEHOLDER;
}

function formTitle(source: CitationSource): string {
  return normalize(source.title) || TITLE_PLACEHOLDER;
}

function formatApa(source: CitationSource): string {
  const year = isDefined(source.publicationYear)
    ? `(${source.publicationYear})`
    : `(${NO_DATE_PLACEHOLDER})`;
  let out = `${formAuthor(source)}. ${year}. ${formTitle(source)}`;
  if (isDefined(source.editionLabel)) {
    out += ` (${normalize(source.editionLabel!)})`;
  }
  out += '.';
  if (isDefined(source.publisher)) {
    out += ` ${normalize(source.publisher!)}.`;
  }
  return out;
}

function formatMla(source: CitationSource): string {
  const title = formTitle(source);
  const edition = isDefined(source.editionLabel)
    ? `, ${normalize(source.editionLabel!)}`
    : '';
  const titleClause = `${formAuthor(source)}. ${title}${edition}.`;
  const publisher = isDefined(source.publisher) ? normalize(source.publisher!) : null;
  const year = yearLabel(source) || NO_DATE_PLACEHOLDER;
  return `${titleClause} ${publisher ? `${publisher}, ` : ''}${year}.`;
}

function formatChicago(source: CitationSource): string {
  let out = `${formAuthor(source)}. ${formTitle(source)}.`;
  if (isDefined(source.editionLabel)) {
    out += ` ${normalize(source.editionLabel!)}.`;
  }
  if (isDefined(source.publisher)) {
    out += ` ${normalize(source.publisher!)},`;
  }
  out += ` ${yearLabel(source) || NO_DATE_PLACEHOLDER}.`;
  return out;
}

function formatBibTex(source: CitationSource): string {
  const fields: string[] = [];
  fields.push(`  author    = {${bibTexEscape(formAuthor(source))}}`);
  fields.push(`  title     = {${bibTexEscape(formTitle(source))}}`);
  if (isDefined(source.publisher)) {
    fields.push(`  publisher = {${bibTexEscape(normalize(source.publisher!))}}`);
  }
  if (isDefined(source.publicationYear)) {
    fields.push(`  year      = {${source.publicationYear}}`);
  }
  if (isDefined(source.editionLabel)) {
    fields.push(`  edition   = {${bibTexEscape(normalize(source.editionLabel!))}}`);
  }
  if (isDefined(source.volumeLabel)) {
    fields.push(`  volume    = {${bibTexEscape(normalize(source.volumeLabel!))}}`);
  }
  if (isDefined(source.isbn)) {
    fields.push(`  isbn      = {${bibTexEscape(normalize(source.isbn!))}}`);
  }
  return `@book{${bibTexKey(source)},\n${fields.join('\n')}\n}`;
}

function formatRis(source: CitationSource): string {
  const lines: string[] = ['TY  - BOOK'];
  lines.push(`AU  - ${formAuthor(source)}`);
  lines.push(`TI  - ${formTitle(source)}`);
  if (isDefined(source.publisher)) {
    lines.push(`PB  - ${normalize(source.publisher!)}`);
  }
  if (isDefined(source.publicationYear)) {
    lines.push(`PY  - ${source.publicationYear}`);
  }
  if (isDefined(source.editionLabel)) {
    lines.push(`ET  - ${normalize(source.editionLabel!)}`);
  }
  if (isDefined(source.volumeLabel)) {
    lines.push(`VL  - ${normalize(source.volumeLabel!)}`);
  }
  if (isDefined(source.isbn)) {
    lines.push(`SN  - ${normalize(source.isbn!)}`);
  }
  lines.push('ER  - ');
  return lines.join('\n');
}

export function formatCitation(
  format: CitationFormat,
  source: CitationSource,
): FormatCitationResult {
  switch (format) {
    case CitationFormat.APA:
      return {
        citation: formatApa(source),
        missing: missingFields(source, format),
        usedEdition: isDefined(source.editionLabel),
      };
    case CitationFormat.MLA:
      return {
        citation: formatMla(source),
        missing: missingFields(source, format),
        usedEdition: isDefined(source.editionLabel),
      };
    case CitationFormat.CHICAGO:
      return {
        citation: formatChicago(source),
        missing: missingFields(source, format),
        usedEdition: isDefined(source.editionLabel),
      };
    case CitationFormat.BIBTEX:
      return {
        citation: formatBibTex(source),
        missing: missingFields(source, format),
        usedEdition: isDefined(source.editionLabel),
      };
    case CitationFormat.RIS:
      return {
        citation: formatRis(source),
        missing: missingFields(source, format),
        usedEdition: isDefined(source.editionLabel),
      };
    default:
      throw new Error(`Unsupported citation format: ${format}`);
  }
}