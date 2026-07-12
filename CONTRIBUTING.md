# Contributing to TestPulse

Thanks for your interest in contributing!

## Developer Certificate of Origin (DCO)

TestPulse does **not** use a CLA. Instead, contributions are accepted under the
[Developer Certificate of Origin, Version 1.1](https://developercertificate.org/).

By signing off on your commits you certify that you wrote the change (or have the
right to submit it) under the project's license (AGPLv3).

Sign off every commit:

```bash
git commit -s -m "feat: add whatever"
```

This appends a `Signed-off-by: Your Name <you@example.com>` trailer. CI rejects
pull requests containing commits without a sign-off.

## Development workflow

TestPulse is developed **spec-first**: changes start as [OpenSpec](openspec/) proposals
(specs + design + tasks) before implementation. For anything beyond a trivial fix,
open an issue or draft proposal first so the design conversation happens before the code.

### Repository layout

```
apps/api/          Go backend (REST API, MCP server, auth)
apps/web/          React + TypeScript + Vite frontend
packages/shared/   OpenAPI spec and generated clients
deploy/compose/    docker-compose stack
deploy/helm/       Helm chart
openspec/          specs and change proposals
```

### Prerequisites

- Go 1.22+
- Node.js 20+
- Docker (for the compose stack and integration verification)

### Common commands

Run `make help` (or read the `Makefile`) for build, test, lint, and dev targets.
The full development guide is at [docs/development.md](docs/development.md).

### Documentation

Docs live in [`docs/`](docs/README.md) and are part of the definition of done:
if your change alters behavior, configuration, APIs, or deployment, update the
affected pages in the same pull request.

## Code style

- Go: `gofmt` + `golangci-lint` must pass.
- TypeScript: `eslint` + `tsc --noEmit` must pass.
- Keep changes minimal and scoped; match the surrounding code's style.

## License

By contributing, you agree that your contributions are licensed under the
[GNU AGPLv3](LICENSE).
