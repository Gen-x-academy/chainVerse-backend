# Scholarship Application Forms

> **Issue:** [#1131 — Design configurable application forms](https://github.com/Gen-x-academy/chainVerse-backend/issues/1131)  
> **Module:** `src/scholarships/`  
> **Collection:** `scholarship_application_forms`  
> **Owner:** Platform / Scholarships team

---

## Overview

The Application Forms feature lets administrators build and publish structured,
multi-section forms that scholarship applicants fill in.  Forms are fully
configurable — field types, required/optional status, conditional visibility,
and allowed options are all driven by data rather than code.

---

## Form Lifecycle

```
DRAFT ──publish──> PUBLISHED ──archive──> ARCHIVED
  ^                    |
  |                    └─ (immutable — no edits allowed)
  └── only DRAFT forms can be updated
```

| Status       | Can be edited? | Accepts answers? | Notes |
|---|---|---|---|
| `DRAFT`      | ✅ Yes | ❌ No | Under construction |
| `PUBLISHED`  | ❌ No  | ✅ Yes | Schema is frozen |
| `ARCHIVED`   | ❌ No  | ❌ No | Retired form |

### Immutability constraint

Once a form transitions to `PUBLISHED` its `sections` and `fields` arrays
**cannot be changed**.  This ensures that answers stored by the application
layer always correspond to a well-defined schema version.

If structural changes are needed after publication:

1. Archive the current published form.
2. Create a new DRAFT with the required changes.
3. Publish the new form.

Each publish call preserves the current `version` number on the document so
that stored answers can be matched back to the exact schema they were
validated against.

---

## Conditional Field Validation

Fields can carry a `conditionalOn` rule:

```json
{
  "fieldId": "state",
  "label": "State / Region",
  "type": "text",
  "required": false,
  "conditionalOn": {
    "fieldId": "country",
    "value": "Nigeria"
  }
}
```

When `validateAnswers` is called:

- If the **controlling field** (`country`) does not hold the specified value
  (`"Nigeria"`), the conditional field (`state`) is **skipped entirely** —
  even if it is marked `required`.
- If the condition **is** met the field is treated as a normal required/optional
  field and its value is subject to all other validations (options check, etc.).

---

## API Endpoints

| Method | Path | Roles | Description |
|---|---|---|---|
| `POST` | `/scholarships/application-forms` | ADMIN | Create a DRAFT form |
| `GET` | `/scholarships/application-forms/program/:programId` | ADMIN, STUDENT | List non-archived forms |
| `GET` | `/scholarships/application-forms/:id` | ADMIN, STUDENT | Get a single form |
| `PATCH` | `/scholarships/application-forms/:id` | ADMIN | Update a DRAFT form |
| `POST` | `/scholarships/application-forms/:id/publish` | ADMIN | Publish a DRAFT form |
| `POST` | `/scholarships/application-forms/:id/archive` | ADMIN | Archive a PUBLISHED form |
| `POST` | `/scholarships/application-forms/:id/validate-answers` | ADMIN, STUDENT | Validate submission answers |

### Tenant ownership

Every form carries a `tenantId`.  Admins supply the `tenantId` in the request
body when creating a form.  API consumers are responsible for ensuring callers
only manage forms belonging to their own tenant; a dedicated multi-tenant
middleware or guard should enforce this in production deployments.

### `POST /:id/validate-answers`

Accepts a `SubmitFormAnswersDto`:

```json
{
  "formId": "<ObjectId>",
  "version": 1,
  "answers": [
    { "fieldId": "field-name", "value": "Amara Okafor" },
    { "fieldId": "field-country", "value": "Nigeria" },
    { "fieldId": "field-state", "value": "Lagos" }
  ]
}
```

Returns:

```json
{ "valid": true, "errors": [] }
```

or on failure:

```json
{
  "valid": false,
  "errors": [
    "Field \"field-name\" (Full Name) is required.",
    "Field \"field-country\": value \"Zephyrland\" is not a valid option. Allowed: [Nigeria, Ghana, Kenya]."
  ]
}
```

This endpoint **never throws** on validation failures — it always returns
`200 OK` with a structured result.  The calling layer (e.g. an application
submission service) decides whether to reject or warn.

---

## Error Codes

| Code | HTTP | When raised |
|---|---|---|
| `BIZ_FORM_NOT_DRAFT` | 422 | Attempting to update or publish a non-DRAFT form |
| `BIZ_FORM_NOT_PUBLISHED` | 422 | Attempting to archive a non-PUBLISHED form |
| `BIZ_FORM_VERSION_MISMATCH` | 422 | Reserved for future strict-version enforcement |
| `RES_NOT_FOUND` | 404 | Form id does not exist |

---

## Data Model

### ApplicationForm

| Field | Type | Notes |
|---|---|---|
| `programId` | string | Index; identifies the scholarship programme |
| `tenantId` | string | Index; owning organisation |
| `version` | number | Starts at 1; answers reference this version |
| `title` | string | max 200 chars |
| `sections` | FormSection[] | Ordered array of sections |
| `status` | enum | `draft` \| `published` \| `archived` |
| `publishedAt` | Date? | Set on first publish |
| `publishedBy` | string? | User ID of publishing admin |
| `createdBy` | string | User ID of creating admin |
| `createdAt` | Date | Auto-managed by Mongoose |
| `updatedAt` | Date | Auto-managed by Mongoose |

### FormSection

| Field | Type | Notes |
|---|---|---|
| `sectionId` | string | Client UUID or server-generated |
| `title` | string | max 200 chars |
| `order` | number | Zero-based; controls display order |
| `fields` | FormField[] | Fields in this section |
| `isRequired` | boolean | Default `true` |

### FormField

| Field | Type | Notes |
|---|---|---|
| `fieldId` | string | Unique within the form |
| `label` | string | max 300 chars |
| `type` | FieldType | `text`, `textarea`, `select`, `multiselect`, `file`, `date`, `consent`, `reference` |
| `required` | boolean | Default `false` |
| `options` | string[]? | For SELECT / MULTISELECT |
| `maxLength` | number? | For TEXT / TEXTAREA |
| `conditionalOn` | { fieldId, value }? | Conditional visibility rule |

---

## Privacy Considerations

- Forms themselves contain **no PII** — they define structure only.
- Answers submitted by applicants are validated here but **not stored** by
  this module; the calling service is responsible for persisting and protecting
  answer data in accordance with applicable data protection regulations.
- `createdBy` / `publishedBy` store internal user IDs, not personal data.

---

## Migration Notes

- No migration is required for existing data; this is a new collection
  (`scholarship_application_forms`).
- The unique compound index `{ programId, version }` is created automatically
  by Mongoose at application boot.  Run `db.scholarship_application_forms.createIndex()`
  manually in environments where Mongoose `autoIndex` is disabled.

---

## Operational Impact

- **No new environment variables** are introduced.
- **No external service dependencies** are added.
- The `validateAnswers` endpoint is read-heavy and stateless; it is safe to
  call multiple times without side effects.
- To enable high-throughput form retrieval the `{ tenantId, status }` compound
  index is created at boot.  Monitor index creation on large deployments.
