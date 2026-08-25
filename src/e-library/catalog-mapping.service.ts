import { Injectable, BadRequestException } from '@nestjs/common';

export type SupportedFormat = 'dublin-core' | 'bibtex' | 'ris';

export interface CatalogEntry {
  /** Internal unique identifier – preserved across round-trips. */
  sourceId: string;
  title: string;
  authors: string[];
  /** ISO 8601 date string, e.g. "2024-01-15" */
  publicationDate?: string;
  publisher?: string;
  isbn?: string;
  description?: string;
  /** Fields that cannot be mapped losslessly – surfaced explicitly. */
  lossyFields?: Record<string, unknown>;
}

/**
 * Maps catalog metadata between the internal format and common library
 * standards: Dublin Core, BibTeX, and RIS.
 *
 * - Mappings are versioned via MAPPING_VERSION.
 * - Lossy fields are preserved in lossyFields so callers can decide how
 *   to handle them rather than silently dropping data.
 * - sourceId is always preserved, enabling round-trip fidelity checks.
 *
 * Resolves #1073
 */
@Injectable()
export class CatalogMappingService {
  static readonly MAPPING_VERSION = '1.0.0';

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  exportToDublinCore(entry: CatalogEntry): Record<string, string | string[]> {
    this.validateEntry(entry);
    return {
      'dc:identifier': entry.sourceId,
      'dc:title': entry.title,
      'dc:creator': entry.authors,
      ...(entry.publicationDate && { 'dc:date': entry.publicationDate }),
      ...(entry.publisher && { 'dc:publisher': entry.publisher }),
      ...(entry.description && { 'dc:description': entry.description }),
      'dc:type': 'Text',
      'dc:format': 'application/octet-stream',
    };
  }

  exportToBibTeX(entry: CatalogEntry): string {
    this.validateEntry(entry);
    const key =
      `${entry.authors[0]?.split(' ').pop() ?? 'unknown'}` +
      `${entry.publicationDate?.slice(0, 4) ?? ''}`;
    const fields = [
      `  title     = {${entry.title}}`,
      `  author    = {${entry.authors.join(' and ')}}`,
      entry.publicationDate ? `  year      = {${entry.publicationDate.slice(0, 4)}}` : null,
      entry.publisher ? `  publisher = {${entry.publisher}}` : null,
      entry.isbn ? `  isbn      = {${entry.isbn}}` : null,
      `  note      = {sourceId:${entry.sourceId}}`,
    ]
      .filter(Boolean)
      .join(',\n');

    return `@book{${key},\n${fields}\n}`;
  }

  exportToRis(entry: CatalogEntry): string {
    this.validateEntry(entry);
    const lines: string[] = [
      'TY  - BOOK',
      `ID  - ${entry.sourceId}`,
      `TI  - ${entry.title}`,
      ...entry.authors.map((a) => `AU  - ${a}`),
    ];
    if (entry.publicationDate) lines.push(`PY  - ${entry.publicationDate.slice(0, 4)}`);
    if (entry.publisher) lines.push(`PB  - ${entry.publisher}`);
    if (entry.isbn) lines.push(`SN  - ${entry.isbn}`);
    if (entry.description) lines.push(`AB  - ${entry.description}`);
    lines.push('ER  -');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  importFromDublinCore(dc: Record<string, string | string[]>): CatalogEntry {
    const title = this.asString(dc['dc:title']);
    if (!title) throw new BadRequestException('dc:title is required');
    const sourceId = this.asString(dc['dc:identifier']) ?? `import-${Date.now()}`;
    const authors = this.asArray(dc['dc:creator']);

    const known = new Set([
      'dc:identifier', 'dc:title', 'dc:creator', 'dc:date',
      'dc:publisher', 'dc:description', 'dc:type', 'dc:format',
    ]);
    const lossy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dc)) {
      if (!known.has(k)) lossy[k] = v;
    }

    return {
      sourceId,
      title,
      authors,
      publicationDate: this.asString(dc['dc:date']),
      publisher: this.asString(dc['dc:publisher']),
      description: this.asString(dc['dc:description']),
      ...(Object.keys(lossy).length > 0 && { lossyFields: lossy }),
    };
  }

  importFromRis(risText: string): CatalogEntry {
    const lines = risText.split('\n').map((l) => l.trim()).filter(Boolean);
    const fields: Record<string, string[]> = {};
    for (const line of lines) {
      const match = line.match(/^([A-Z0-9]{2})\s+-\s+(.*)$/);
      if (match) {
        const [, tag, value] = match;
        fields[tag] = [...(fields[tag] ?? []), value];
      }
    }

    const title = fields['TI']?.[0] ?? fields['T1']?.[0];
    if (!title) throw new BadRequestException('RIS TI/T1 (title) is required');
    const sourceId = fields['ID']?.[0] ?? `import-${Date.now()}`;

    const known = new Set(['TY', 'ID', 'TI', 'T1', 'AU', 'A1', 'PY', 'Y1', 'PB', 'SN', 'AB', 'ER']);
    const lossy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!known.has(k)) lossy[k] = v;
    }

    return {
      sourceId,
      title,
      authors: fields['AU'] ?? fields['A1'] ?? [],
      publicationDate: fields['PY']?.[0] ?? fields['Y1']?.[0],
      publisher: fields['PB']?.[0],
      isbn: fields['SN']?.[0],
      description: fields['AB']?.[0],
      ...(Object.keys(lossy).length > 0 && { lossyFields: lossy }),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private validateEntry(entry: CatalogEntry): void {
    if (!entry.sourceId) throw new BadRequestException('sourceId is required');
    if (!entry.title) throw new BadRequestException('title is required');
    if (!Array.isArray(entry.authors)) throw new BadRequestException('authors must be an array');
  }

  private asString(v: string | string[] | undefined): string | undefined {
    return Array.isArray(v) ? v[0] : v;
  }

  private asArray(v: string | string[] | undefined): string[] {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }
}