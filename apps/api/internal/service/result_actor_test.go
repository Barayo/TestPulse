package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// resultActorTestService/Project/Case mirror the run_lifecycle_test.go
// helpers but use a distinct DB namespace to avoid cross-test pool reuse.
func resultActorTestService(t *testing.T) *service.Service {
	t.Helper()
	return lifecycleTestService(t)
}

func mustResultActorRun(t *testing.T, s *service.Service, ctx context.Context) (domain.Run, domain.RunItem) {
	t.Helper()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	return run, items[0]
}

// TestRecordResultDefaultsActorFromContext covers link-result-actor-to-
// identity's default path: omitting Actor fills the display name from the
// authenticated caller, and records their real actorKind/ref.
func TestRecordResultDefaultsActorFromContext(t *testing.T) {
	s := resultActorTestService(t)
	ctx := domain.WithActor(context.Background(), domain.Actor{
		ID: "user-1", Kind: domain.ActorKindUser, DisplayName: "Ana", EffectiveUserID: "user-1",
	})
	_, item := mustResultActorRun(t, s, ctx)

	res, err := s.RecordResult(ctx, item.ID, domain.NewResult{Verdict: domain.VerdictPass})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if res.Actor != "Ana" {
		t.Errorf("Actor = %q, want Ana (defaulted from context)", res.Actor)
	}
	if res.ActorKind != domain.ResultActorUser || res.ActorRefID != "user-1" {
		t.Errorf("ActorKind/ActorRefID = %q/%q, want user/user-1", res.ActorKind, res.ActorRefID)
	}
}

// TestRecordResultOverrideKeepsRealActorLink covers the override path: an
// explicit Actor changes the displayed name, but the real authenticated
// actor's kind/ref is still recorded underneath it (design D2) — an agent
// can record on behalf of a named human without spoofing identity.
func TestRecordResultOverrideKeepsRealActorLink(t *testing.T) {
	s := resultActorTestService(t)
	ctx := domain.WithActor(context.Background(), domain.Actor{
		ID: "agent-1", Kind: domain.ActorKindAgent, DisplayName: "ci-bot", EffectiveUserID: "agent-1",
	})
	_, item := mustResultActorRun(t, s, ctx)

	res, err := s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "Manual Tester", Verdict: domain.VerdictFailed})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if res.Actor != "Manual Tester" {
		t.Errorf("Actor = %q, want the override Manual Tester", res.Actor)
	}
	if res.ActorKind != domain.ResultActorAgent || res.ActorRefID != "agent-1" {
		t.Errorf("ActorKind/ActorRefID = %q/%q, want agent/agent-1 even with an override display name", res.ActorKind, res.ActorRefID)
	}
}

// TestRecordResultNoContextActorFallsBackToUnknown covers the case where no
// resolved Actor exists in context (reachable only ahead of auth
// middleware, if at all) — actorKind falls back to "unknown" rather than
// propagating a zero-value ActorKind or panicking.
func TestRecordResultNoContextActorFallsBackToUnknown(t *testing.T) {
	s := resultActorTestService(t)
	ctx := context.Background()
	_, item := mustResultActorRun(t, s, ctx)

	res, err := s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "legacy-client", Verdict: domain.VerdictPass})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if res.ActorKind != domain.ResultActorUnknown || res.ActorRefID != "" {
		t.Errorf("ActorKind/ActorRefID = %q/%q, want unknown/\"\"", res.ActorKind, res.ActorRefID)
	}

	// With no context actor AND no client-supplied Actor, there is nothing
	// to populate the required display name with — a clean validation
	// error, not a raw DB constraint violation.
	_, err = s.RecordResult(ctx, item.ID, domain.NewResult{Verdict: domain.VerdictPass})
	if err == nil {
		t.Fatal("expected validation error for missing actor with no context actor, got nil")
	}
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("error %v is not a ValidationError", err)
	}
}
