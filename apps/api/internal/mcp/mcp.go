// Package mcp exposes TestPulse's domain operations as MCP tools for AI
// agents (add-mcp-server) — a thin layer over service.Service, mirroring
// the tool-surface design settled in ROADMAP.md v0.1: ~11 coarse-grained,
// hybrid tools, not a CRUD mirror and not workflow mega-tools. Deletes stay
// REST-only (no delete tool is registered here).
package mcp

import (
	"errors"
	"fmt"
	"net/http"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// serverInstructions orients a connecting agent with the conventions it
// needs but has no other way to discover before its first call: what a key
// looks like, and the fixed vocabularies for priority/verdict/status —
// getting one of these wrong is the most common first-call failure mode
// for a fresh agent (confirmed during manual QA: an agent guessing "urgent"
// for priority or "in_progress" for status fails until it reads the error).
const serverInstructions = `TestPulse test management. Entities are addressed by human-readable keys (e.g. "SP-C-42" for a case, "SP" for a project), never internal ids — every tool that takes an entity reference takes a key.

Fixed vocabularies:
- priority (case): low, medium, high, critical (default medium)
- verdict (record_result): pass, failed, skipped, blocked
- status (update_run_item_status): pending, pass, failed, skipped, blocked, retest

Start with search or list_projects to find real keys before calling a tool that needs one. get_details takes the entityType from search's results directly (case, suite, run, project, release, testPlan).`

// NewHTTPHandler builds the MCP server's Streamable HTTP handler. The
// caller mounts it at /mcp inside the same authenticated chi group as
// /api/v1 (server.go) — MCP requests authenticate identically to REST via
// that shared `authenticate` middleware, which resolves the Bearer token to
// a domain.Actor on the request's context before this handler ever runs.
// Stateless mode: each MCP request (including every tool call) is a single
// authenticated HTTP POST, matching how a scoped API token is meant to be
// used — no separate session-establishment step to authenticate outside
// REST's own model.
func NewHTTPHandler(svc *service.Service) http.Handler {
	srv := sdkmcp.NewServer(
		// 1.0.0 — the tool surface's own semver, independent of the product
		// release version; see docs/mcp-server.md#versioning-policy. Never
		// bumped from "0.1.0" across the fourteen prior OpenSpec changes
		// that touched this surface because none of them were breaking —
		// that additive history is exactly why 1.0.0 is the right starting
		// point now that the policy is in force, not a sign anything here
		// changed behaviorally in this commit.
		&sdkmcp.Implementation{Name: "testpulse", Version: "1.0.0"},
		&sdkmcp.ServerOptions{Instructions: serverInstructions},
	)
	registerTools(srv, svc)
	return sdkmcp.NewStreamableHTTPHandler(
		func(*http.Request) *sdkmcp.Server { return srv },
		&sdkmcp.StreamableHTTPOptions{Stateless: true},
	)
}

func registerTools(srv *sdkmcp.Server, svc *service.Service) {
	registerWriteTools(srv, svc)
	registerReadTools(srv, svc)
}

// boolPtr is a small helper since ToolAnnotations' optional hint fields are
// *bool (nil means "spec default", not "false").
func boolPtr(b bool) *bool { return &b }

// notFoundf wraps a *ByKey lookup's error with the entity kind and key that
// produced it — every one of those lookups otherwise propagates
// store.ErrNotFound's bare "not found" text verbatim, which gives an agent
// nothing to self-correct from (found during manual QA against a real MCP
// client). The common case (store.ErrNotFound) drops the redundant
// "not found: not found" that %w wrapping would otherwise produce; any
// other error (a real DB failure, not a missing key) keeps its own text via
// %w. A nil err passes through unchanged.
func notFoundf(kind, key string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%s %q not found", kind, key)
	}
	return fmt.Errorf("%s %q not found: %w", kind, key, err)
}
