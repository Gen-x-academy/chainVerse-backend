import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

/** Name of the paged envelope in the generated OpenAPI document. */
export const PAGINATED_RESPONSE_SCHEMA_NAME = 'PaginatedResponse';

/** Class of one item in a paged response, described in OpenAPI. */
export type PaginatedItemType = Function | [Function] | string;

/**
 * Documents a paged `200` response: `{ data, total, page, limit, totalPages }`.
 *
 * Nest's Swagger generator cannot express "an array plus paging metadata" from
 * a return type alone, so without this decorator clients have to guess whether
 * `total` counts the whole collection or the current page — a common source of
 * infinite-scroll and off-by-one-page bugs.
 *
 * @param description  Human-readable summary of what `data` contains.
 * @param itemType     Class (or `type`/`$ref` string) describing one item.
 */
export function ApiPaginatedResponse(
  description: string,
  itemType?: PaginatedItemType,
) {
  return applyDecorators(
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data', 'total', 'page', 'limit', 'totalPages'],
        properties: {
          data: {
            type: 'array',
            description,
            items: itemType
              ? typeof itemType === 'string'
                ? { $ref: itemType }
                : { type: 'object' }
              : { type: 'object' },
          },
          total: {
            type: 'number',
            description:
              'Total documents matching the filter — not the size of this page.',
            example: 137,
          },
          page: {
            type: 'number',
            description: '1-based number of the page returned.',
            example: 1,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of documents `data` may contain.',
            example: 20,
          },
          totalPages: {
            type: 'number',
            description: '`ceil(total / limit)`; 0 when there are no results.',
            example: 7,
          },
        },
      },
    }),
  );
}

/** Alias kept for readability at call sites that document a `200 OK`. */
export const ApiOkResponsePaginated = ApiPaginatedResponse;
