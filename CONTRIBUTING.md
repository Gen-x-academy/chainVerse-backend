# Contributing to chainVerse-backend

Thank you for contributing! Please read these guidelines before opening a PR.

## Branch Protection Rules

Repository admins must configure the following branch protection settings on `main` to prevent broken code from being merged:

### Required settings (GitHub → Settings → Branches → Add rule for `main`)

| Setting | Value |
|---|---|
| **Require status checks to pass before merging** | ✅ Enabled |
| Required status checks | `CI / Lint`, `CI / Build`, `CI / Unit tests`, `CI / E2E tests` |
| **Require at least 1 approving review** | ✅ Enabled |
| **Dismiss stale reviews when new commits are pushed** | ✅ Enabled |
| **Require branches to be up to date before merging** | ✅ Enabled |

### Why each rule matters

- **Status checks** — Prevents merging if lint, build, or tests are failing. The required checks (`CI / Lint`, `CI / Build`, `CI / Unit tests`, `CI / E2E tests`) are defined in `.github/workflows/ci.yml`.
- **Approving review** — Ensures at least one team member has reviewed the code before it lands on `main`.
- **Dismiss stale reviews** — Forces re-review when the author pushes new changes after approval, preventing approval of old code.
- **Up-to-date branches** — Requires the PR branch to be current with `main` before merging, avoiding integration surprises.

## Development Workflow

1. Fork the repo and create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes and write tests.
3. Run checks locally before pushing:
   ```bash
   npm run lint
   npm run build
   npm run test
   npm run test:e2e
   ```
4. Push your branch and open a PR using the PR template.
5. Request a review from at least one maintainer.

## Commit Messages

Use conventional commits:

```
feat: add user authentication endpoint
fix: correct JWT expiry calculation
ci: add npm caching to CI workflow
docs: update CONTRIBUTING with branch protection rules
```

## Environment Variables

If your change requires a new environment variable, add it to `.env.example` with a descriptive comment and note it in your PR description.
