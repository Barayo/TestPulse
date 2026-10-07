.PHONY: help build build-api build-web test test-api test-web lint lint-api lint-web dev-api dev-web compose-up compose-down seed-demo license-report perf-api

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

build: build-api build-web ## Build API and web

build-api: ## Build the Go API binary
	cd apps/api && go build -o bin/testpulse-api ./cmd/testpulse-api

build-web: ## Build the web UI production bundle
	cd apps/web && npm run build

sync-web: build-web ## Copy the web bundle into the API for embedding (containers do this automatically)
	rm -rf apps/api/internal/web/dist
	cp -R apps/web/dist apps/api/internal/web/dist

sync-api-docs: ## Copy the OpenAPI contract and swagger-ui-dist into the API for embedding
	npm -w @testpulse/shared run sync-api-docs

generate: ## Regenerate the TypeScript API client from the OpenAPI spec
	npm -w @testpulse/shared run generate

test: test-api test-web ## Run all tests

test-api: ## Run Go tests (db integration tests need TESTPULSE_TEST_DATABASE_URL; see test-db-up)
	cd apps/api && go test ./...

COVER_MIN := 80
coverage-api: ## Go coverage for internal packages, fails under $(COVER_MIN)%
	cd apps/api && go test -coverprofile=coverage.out -coverpkg=./internal/... ./internal/...
	@cd apps/api && total=$$(go tool cover -func=coverage.out | awk '/^total:/ {sub(/%/,"",$$3); print $$3}'); \
	echo "internal coverage: $$total% (minimum $(COVER_MIN)%)"; \
	awk "BEGIN {exit !($$total >= $(COVER_MIN))}" || { echo "FAIL: coverage below $(COVER_MIN)%"; exit 1; }

coverage-web: ## Web unit-test coverage with thresholds
	cd apps/web && npm run test:coverage

test-db-up: ## Start a throwaway Postgres for db integration tests (port 5433)
	docker run -d --name testpulse-testdb -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
		-e POSTGRES_DB=test -p 5433:5432 postgres:16-alpine
	@echo "export TESTPULSE_TEST_DATABASE_URL='postgres://test:test@localhost:5433/test'"

test-db-down: ## Remove the throwaway test Postgres
	docker rm -f testpulse-testdb

e2e: ## Run Playwright E2E against the compose stack (starts it if needed)
	docker compose -f deploy/compose/docker-compose.yml up --build -d --wait
	cd apps/web && npm run e2e

test-web: ## Run web typecheck (tests come later)
	cd apps/web && npm run typecheck

lint: lint-api lint-web ## Lint everything

lint-api: ## Lint Go code
	cd apps/api && go vet ./... && golangci-lint run

lint-web: ## Lint web code
	cd apps/web && npm run lint

dev-api: ## Run the API locally (expects Postgres; see deploy/compose)
	cd apps/api && go run ./cmd/testpulse-api

seed-demo: ## Populate two realistic example projects for design/UI review (dev only, never run against a real deployment)
	cd apps/api && go run ./cmd/seed-demo

dev-web: ## Run the web dev server
	cd apps/web && npm run dev

compose-up: ## Start the full stack with docker compose
	docker compose -f deploy/compose/docker-compose.yml up --build -d

compose-down: ## Stop the compose stack
	docker compose -f deploy/compose/docker-compose.yml down

license-report: ## Regenerate THIRD-PARTY-LICENSES from the npm workspace and all Go modules
	node scripts/license-report.mjs > THIRD-PARTY-LICENSES

perf-api: ## Run the k6 API load test suite (needs compose stack + seed-demo + TESTPULSE_PERF_TOKEN; see apps/api/perf/README.md)
	@command -v k6 >/dev/null 2>&1 || { echo "k6 is not installed — see https://k6.io/docs/get-started/installation/ (brew install k6 on macOS)"; exit 1; }
	k6 run apps/api/perf/summaries-and-run-items.js
