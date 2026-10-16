# Sponsor & Regulator Audit Exports

## Summary
Design for producing scoped evidence packages for program governance,
decisions, consent, funds, and payments.

## Design
- Export scope is explicit and bounded (a program ID + date range), never
  a full-database dump.
- Requests require strong authorization (admin or compliance role) and
  are themselves recorded in the audit trail from #1195.
- Unrelated applicants outside the requested scope are redacted from any
  joined records before packaging.
- Each export package includes an integrity manifest (checksum per file)
  and expires after a configured retention window, after which the
  download link is invalidated.

## Follow-up
Implement `AuditExportService` reusing the audit trail and file-storage
integration already used by #1193.
