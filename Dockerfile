# TestPulse application image: web bundle embedded in a single Go binary.
# Build from the repository root: docker build -t testpulse .

# --- Stage 1: build the web UI -------------------------------------------
FROM node:24-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN npm -w web run build

# --- Stage 2: build the Go binary with embedded web assets ---------------
FROM golang:1.26-alpine AS api
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum apps/api/
RUN cd apps/api && go mod download
COPY apps/api/ apps/api/
COPY --from=web /src/apps/web/dist/ apps/api/internal/web/dist/
RUN cd apps/api && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
    -o /out/testpulse-api ./cmd/testpulse-api

# --- Stage 3: minimal runtime ---------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /out/testpulse-api /testpulse-api
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/testpulse-api"]
