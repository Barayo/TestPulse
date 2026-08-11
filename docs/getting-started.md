# Getting Started

Two supported ways to run TestPulse: Docker Compose for a local evaluation,
Helm for Kubernetes. Both bring up the same stack: the TestPulse application
container (API + embedded web UI) and PostgreSQL 16.

## Docker Compose

Prerequisite: Docker with the compose plugin.

```bash
git clone https://github.com/Barayo/TestPulse.git
cd TestPulse
docker compose -f deploy/compose/docker-compose.yml up --build -d
```

Then just open **http://localhost:8080** — with only the Sample Project
public (it's public by default; see
[Public project access](test-management.md#public-project-access)), the
root URL redirects straight to it, fully browsable with no account needed
(**http://localhost:8080/projects/SP** also works directly; the older
**http://localhost:8080/public/SP** link still works too, as a redirect).
To do anything beyond browsing (create a project, record a result, invite
someone), sign in at **http://localhost:8080/login** with the bootstrap
admin credentials from
[Configuration reference](deployment.md#configuration-reference)
(`TESTPULSE_ADMIN_EMAIL` / `TESTPULSE_ADMIN_PASSWORD`).

- The UI, the REST API (`/api/v1`), and the health endpoints all serve from
  port 8080.
- Database migrations apply automatically on startup.
- PostgreSQL data lives in the named volume `testpulse-db` and survives
  `docker compose down` / `up`. Use `down -v` to wipe it.
- A fresh instance (zero existing projects) automatically gets a populated
  **Sample Project** — sections, classified cases, suites, an open run, a
  closed run, and a run imported from a JUnit XML report — so there's
  something real to explore immediately. It's marked with a "Sample" badge
  in the project list, behaves like any other project, and is safe to
  archive or edit — it's created once and never comes back on its own.

Check that everything is healthy:

```bash
curl http://localhost:8080/readyz     # {"status":"ok"}
```

## Kubernetes (Helm)

Prerequisite: a cluster and Helm 3.

```bash
helm install testpulse deploy/helm/testpulse
```

The default install bundles a single-replica PostgreSQL with a 1Gi
PersistentVolumeClaim — fine for evaluation, not for production. For
production, bring your own database; see
[Deployment](deployment.md#external-database).

Verify:

```bash
kubectl get pods            # app + db Ready
kubectl port-forward svc/testpulse-testpulse 8080:8080
curl http://localhost:8080/readyz
```

## What you get right now

TestPulse is at the **walking skeleton** stage (v0.0): a deployable, healthy,
essentially empty application. Test cases, suites, runs, users, and the MCP
server arrive in v0.1 — see the [Roadmap](../ROADMAP.md).

## Next steps

- [Deployment](deployment.md) — full configuration reference and Helm values
- [Development](development.md) — hacking on TestPulse locally
