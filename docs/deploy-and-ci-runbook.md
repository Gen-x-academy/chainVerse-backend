# CI and Deployment Runbook

This runbook describes the repository's delivery path after the CI hardening work.

## CI gates

- lint
- build
- unit tests
- e2e tests
- npm audit at high severity
- Docker build

## Deployment flow

1. Merge to `main`.
2. GitHub Actions builds and pushes the Docker image.
3. The deploy job SSHes to the staging host.
4. The staging host pulls the new image and restarts services.
5. The smoke test verifies the app responds on the expected endpoints.

## Recovery

- If the deploy job fails before the push step, no cluster state changes are made.
- If the smoke test fails, the deploy script exits non-zero and the pipeline stops.
- Restore the previous image tag if the new version is unhealthy.

