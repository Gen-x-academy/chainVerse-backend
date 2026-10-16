# E-Library: Citation Export (Issue #1054)

Deterministic, standards-friendly citations for catalog (`Book`) records and
caller-owned saved reading lists. Module code: `src/e-library/`. Registered in
`src/app.module.ts` as `ELibraryModule`.

## API surface

All routes require a valid student or tutor JWT (`@UseGuards(JwtAuthGuard,
RolesGuard)`, `@Roles(Role.STUDENT, Role.TUTOR)`). Both versions are aliases.

| Method | Path | Description |
|---|---|---|
| `GET` | `library/citations/catalog?ids=<csv>&format=<style>` | Cite catalog books in requested id order |
| `GET` | `v1/library/citations/catalog?ids=<csv>&format=<style>` | Alias |
| `GET` | `library/citations/reading-lists/:listId?format=<style>` | Cite every item in the caller-owned saved list |
| `GET` | `v1/library/citations/reading-lists/:listId?format=<style>` | Alias |

`format` is one of `apa`, `mla`, `chicago`, `bibtex`, `ris`.

Responses are deterministic envelopes:

```json
{
  "format": "apa",
  "citations": [
    { "bookId": "64b8...c8d9", "citation": "Frank Herbert. (1965). Dune (50th Anniversary ed.). Chilton Books.", "missing": [] }
  ]
}
```

`missing` lists the core metadata fields (`author`, `title`, `publisher`,
`publicationYear`, and for `bibtex`/`ris` also `isbn`) that are absent from
the catalog record, so clients can surface incomplete metadata explicitly.
Citations still render with standard placeholders (`n.d.`, `Unknown author`,
`[Untitled]`) instead of failing, so exported files remain parseable.

## Authority and privacy

- Citations are composed **only** from `Book` fields. Two additive optional
  fields were added to `Book` to support year and edition clauses —
  `publicationYear` and `editionLabel`. Existing documents without either
  field are unaffected (both optional, no migration required).
- Reading lists (`SavedList`) are private: exporting one requires the JWT
  subject to match `SavedList.patronId`. Cross-owner access returns
  `403`.
- Missing/unknown catalog ids fail the whole request with `404` +
  `RES_BOOK_NOT_FOUND` listing the ids, so tutors can reconcile stale lists
  instead of silently dropping rows.

## Escaping / injection safety

- BibTeX output escapes `\ { } % & # _ $ ~ ^` inside field values.
- All styles collapse internal whitespace (protecting against multi-line
  value injection) and strip surrounding whitespace.
- Output is fully deterministic: identical input always yields identical
  output, including field ordering and trailing whitespace (`ER  - ` in
  RIS, no timestamp noise).

## Operational notes

- No background jobs, no new environment variables, no new storage.
- Read-only: the feature never mutates catalog, list, or audit state.
- Cite-at-rest performance: batches are single `Book` queries using `$in`;
  reading-list exports query the list once and the books once (no N+1).