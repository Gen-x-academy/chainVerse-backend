# CI Baseline Plan (aaseenib)

Covers: #545, #546, #547, #548

- Redis service container required for rate-limit integration checks.
- Docker image build verification required on each PR.
- Deploy workflow required on merge to main.
- npm audit gate required to fail on high-severity vulnerabilities.
