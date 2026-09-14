# TestPulse import connector image (add-testrail-importer) — a separate
# deployable from the main TestPulse API image, per establish-architecture's
# standing decision that connectors are external clients, never in-process
# plugins. Build from this directory: docker build -t testpulse-import-connector .
#
# Deliberately named "import-connector", not "testrail-importer" — TestRail
# is one --source backend inside a generic tool, not the tool's name
# (design.md D10, a trademark-usage-guideline constraint, not a style
# choice).

# --platform=$BUILDPLATFORM + explicit GOOS/GOARCH: Go cross-compiles
# natively without help from QEMU, so this stage always runs on the build
# host's own architecture — running the Go compiler itself under QEMU's
# user-mode emulation is known to crash intermittently
# ("found pointer to free object"), the same issue the root Dockerfile
# documents for the main API image.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
WORKDIR /src
ARG TARGETOS
ARG TARGETARCH
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" \
    -o /out/import-connector ./cmd/import-connector

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/import-connector /import-connector
USER nonroot
ENTRYPOINT ["/import-connector"]
