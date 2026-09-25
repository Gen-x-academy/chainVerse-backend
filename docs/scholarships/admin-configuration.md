# Scholarship Administration Configuration

## Summary
Design for managing limits, deadlines, providers, assets, templates, and
risk thresholds through validated, versioned configuration.

## Design
- A `ScholarshipConfig` document with a monotonically increasing `version`
  field; updates create a new version rather than mutating in place.
- Config changes require an `admin` or `finance-admin` role and are written
  through a DTO validated against a JSON schema before persistence.
- Secrets (provider API keys, webhook signing keys) are stored by
  reference (a secrets-manager key name), never returned in API responses.
- A `GET /admin/scholarship-config/preview` endpoint returns the effective
  config diff before an admin confirms an update.

## Follow-up
Implement the versioned config schema, the preview endpoint, and audit
logging for every applied version change.
