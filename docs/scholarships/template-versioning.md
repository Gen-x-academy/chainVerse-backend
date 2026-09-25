# Scholarship Communication Template Versioning

## Summary
Design for managing localized templates with safe variables, previews,
approval, and rollback.

## Design
- Templates are stored with an incrementing `version` per
  `{templateKey, locale}`; publishing creates a new version rather than
  overwriting the active one.
- Template variables are declared explicitly (`{{applicantName}}` etc.);
  publishing fails validation if the template references an undeclared
  variable.
- Every sent message records the exact `templateKey@version` used, so
  delivery history is auditable even after later edits.
- Rollback re-activates a prior version without deleting newer ones.
- Rendered previews never log applicant PII used in the preview data.

## Follow-up
Implement the versioned template schema and a
`POST /admin/templates/:key/preview` endpoint using safe fixture data.
