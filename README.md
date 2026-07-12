# TestPulse

**The open-source test management platform your AI agents can use as fluently as you do.**

TestPulse is an AI-native, MCP-first test management platform. Humans get a clean UI for authoring and executing test cases, suites, and runs; AI agents get a first-class seat at the table — their own identity, scoped API tokens, and an [MCP](https://modelcontextprotocol.io) server — so *"Claude, read `requirements.md` and create a test suite in TestPulse"* just works.

> **Status**: early development — the core test management domain (projects, versioned test cases, suites, runs, execution) is implemented and usable. **There is no authentication yet** — don't expose an instance beyond a trusted local network. See [ROADMAP.md](ROADMAP.md) for where this is going.

## Why TestPulse?

- **AI-native, not AI-bolted-on** — agents are real actors in the RBAC model and audit log, and the MCP server is part of the core product, not a plugin.
- **Genuinely open source** — AGPLv3, built entirely on open-source technology. The open core includes SSO.
- **Trivially self-hostable** — a single Go binary, a PostgreSQL database, multi-arch container images (amd64 + arm64). One `docker compose up` to evaluate; a Helm chart for production Kubernetes.

## Quickstart

### Docker Compose (evaluation)

```bash
git clone https://github.com/Barayo/TestPulse.git
cd TestPulse
docker compose -f deploy/compose/docker-compose.yml up --build -d
```

Open http://localhost:8080 — the UI, API (`/api/v1`), and health probes
(`/healthz`, `/readyz`) all serve from the same port. Data persists in a named
Docker volume across restarts.

### Kubernetes (Helm)

```bash
helm install testpulse deploy/helm/testpulse
```

The default install bundles a PostgreSQL instance for evaluation. For
production, bring your own database:

```bash
helm install testpulse deploy/helm/testpulse \
  --set postgresql.enabled=false \
  --set externalDatabase.host=your-postgres-host \
  --set externalDatabase.existingSecret=your-db-secret
```

### Configuration

| Variable | Default | Description |
|---|---|---|
| `TESTPULSE_DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `TESTPULSE_ADDR` | `:8080` | HTTP listen address |
| `TESTPULSE_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |

Schema migrations run automatically and idempotently at startup.

## Documentation

Full documentation lives in [`docs/`](docs/README.md): [getting started](docs/getting-started.md) · [test management](docs/test-management.md) · [deployment & configuration](docs/deployment.md) · [architecture](docs/architecture.md) · [database](docs/database.md) · [development](docs/development.md) · [API](docs/api.md).

## Architecture at a glance

- **Backend**: Go — REST API, MCP server, auth; one static binary
- **Frontend**: React + TypeScript + Vite
- **Database**: PostgreSQL 16+
- **Contract**: OpenAPI 3 — the frontend, agents, and connectors all consume the same API
- **Deployment**: docker-compose and Helm, multi-arch images

Architecture decisions are recorded in [`openspec/`](openspec/) — this project is developed spec-first with AI assistance.

## License

TestPulse is licensed under the [GNU AGPLv3](LICENSE).

**Using TestPulse inside your company?** Deploying and using an unmodified TestPulse internally — even commercially, even over your network — imposes no obligations on you. The AGPL's source-sharing requirement applies only if you *modify* TestPulse and make the modified version available to others over a network.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) — TestPulse uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO): sign your commits with `git commit -s`.
