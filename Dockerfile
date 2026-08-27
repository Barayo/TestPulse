# TestPulse application image: web bundle embedded in a single Go binary.
# Build from the repository root: docker build -t testpulse .

# --- Stage 1: build the web UI -------------------------------------------
# --platform=$BUILDPLATFORM: this stage's output (a static JS bundle) is
# arch-independent, so it always runs natively on the build host instead of
# once per target platform under QEMU emulation.
FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN npm -w web run build

# --- Stage 2: build the Go binary with embedded web assets ---------------
# --platform=$BUILDPLATFORM + explicit GOOS/GOARCH: Go cross-compiles
# natively without help from QEMU, so this stage also always runs on the
# build host's own architecture — running the Go compiler itself under
# QEMU's user-mode emulation is known to crash intermittently
# ("found pointer to free object").
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS api
WORKDIR /src
ARG TARGETOS
ARG TARGETARCH
COPY apps/api/go.mod apps/api/go.sum apps/api/
RUN cd apps/api && go mod download
COPY apps/api/ apps/api/
COPY --from=web /src/apps/web/dist/ apps/api/internal/web/dist/
RUN cd apps/api && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" \
    -o /out/testpulse-api ./cmd/testpulse-api

# --- Stage 3: minimal runtime ---------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /out/testpulse-api /testpulse-api
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/testpulse-api"]
