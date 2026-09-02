# TestPulse Documentation

TestPulse is an open-source, AI-native test management platform. This is the
documentation index — every page is Markdown, lives in this repo, and is
updated in the same change that alters the behavior it describes.

## For users

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Running TestPulse with Docker Compose or Helm |
| [Test management](test-management.md) | Using TestPulse: projects, versioned test cases, suites, runs, the execution board |
| [Importing results](importing-results.md) | Bulk-importing JUnit XML reports from CI, the match-only contract, the `pytest-testpulse`/`testpulse-maven-plugin` plugins, and the no-install `conftest.py` fallback |
| [Deployment](deployment.md) | Configuration reference, Helm values, production notes |
| [Integrations](integrations.md) | The Jira connector: what it does, deploying it, and its config reference |
| [API](api.md) | The REST API, OpenAPI contract, and health endpoints |
| [MCP server](mcp-server.md) | Connecting an AI agent over the Model Context Protocol: tokens, the `/mcp` endpoint, the tool reference |
| [Database](database.md) | Schema reference and entity relationships |

## For contributors

| Page | What it covers |
|---|---|
| [Architecture](architecture.md) | System design, stack decisions, and their rationale |
| [Development](development.md) | Local setup, repo layout, build/test/lint workflow |
| [Testing](testing.md) | TDD/BDD practice, test pyramid, coverage gates |
| [Design system](design-system.md) | UI patterns (property rows, sidebar sections, chart colors, empty states) future pages should follow |
| [Contributing](../CONTRIBUTING.md) | DCO sign-off, spec-first workflow, code style |
| [Roadmap](../ROADMAP.md) | Release ladder and per-version scope |

## Documentation conventions

- Docs describe **what exists**, not what is planned — planned work lives in
  [ROADMAP.md](../ROADMAP.md) and `openspec/changes/`.
- Every change that alters behavior, configuration, APIs, or deployment updates
  the affected pages **in the same change** (see [CLAUDE.md](../CLAUDE.md)).
- Specs under `openspec/specs/` are the source of truth for requirements; docs
  are the readable narrative on top of them.
