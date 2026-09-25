# Applicant Data Access & Export

## Summary
Design for letting applicants request a machine-readable copy of their
scholarship data and consent history.

## Design
- Export requests authenticate with a fresh, strongly-verified session
  (re-auth or step-up MFA), not just an existing session token.
- Exports run asynchronously; the applicant is notified when a
  time-limited, single-use download link is ready.
- The export excludes other users' private reviewer notes and internal
  fraud-signal data, including only the requesting applicant's own record.
- Every export request and download is written to the audit trail
  (see #1195).

## Follow-up
Implement `ApplicantDataExportJob` producing a signed, expiring download
URL via the existing file-storage integration.
