package service_test

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// TestRecordClientErrorLogsAWarnLevelLine covers add-frontend-error-
// reporting: a frontend crash/failed-API-call report is logged at Warn
// level via the existing slog-based logger, mirroring dispatchWebhooks'
// existing failure-logging shape — no persistence.
func TestRecordClientErrorLogsAWarnLevelLine(t *testing.T) {
	h := &recordingHandler{}
	s := service.New(nil).WithLogger(slog.New(h))

	if err := s.RecordClientError(context.Background(), domain.ClientErrorReport{Kind: "crash", Message: "boom"}); err != nil {
		t.Fatalf("RecordClientError: %v", err)
	}

	msgs := h.messages()
	if len(msgs) != 1 || msgs[0] != "frontend client error" {
		t.Fatalf("logged messages = %+v, want exactly [\"frontend client error\"]", msgs)
	}
	rec := h.records[0]
	if rec.Level != slog.LevelWarn {
		t.Errorf("log level = %v, want Warn", rec.Level)
	}
	found := false
	rec.Attrs(func(a slog.Attr) bool {
		if a.Key == "message" && a.Value.String() == "boom" {
			found = true
		}
		return true
	})
	if !found {
		t.Error("logged record did not include the report's message attribute")
	}
}

// TestRecordClientErrorRequiresMessage covers add-frontend-error-reporting:
// an empty message is rejected and never logged.
func TestRecordClientErrorRequiresMessage(t *testing.T) {
	h := &recordingHandler{}
	s := service.New(nil).WithLogger(slog.New(h))

	err := s.RecordClientError(context.Background(), domain.ClientErrorReport{Kind: "crash"})
	if err == nil {
		t.Fatal("expected a validation error for an empty message, got nil")
	}
	if len(h.records) != 0 {
		t.Errorf("logged %d records for an invalid report, want 0", len(h.records))
	}
}

// TestRecordClientErrorIncludesResolvedActor covers add-frontend-error-
// reporting: when the request context carries a resolved actor, it's
// attached to the log line for correlation.
func TestRecordClientErrorIncludesResolvedActor(t *testing.T) {
	h := &recordingHandler{}
	s := service.New(nil).WithLogger(slog.New(h))
	ctx := domain.WithActor(context.Background(), domain.Actor{ID: "user-123", Kind: domain.ActorKindUser})

	if err := s.RecordClientError(ctx, domain.ClientErrorReport{Kind: "crash", Message: "boom"}); err != nil {
		t.Fatalf("RecordClientError: %v", err)
	}

	rec := h.records[0]
	found := false
	rec.Attrs(func(a slog.Attr) bool {
		if a.Key == "actorId" && a.Value.String() == "user-123" {
			found = true
		}
		return true
	})
	if !found {
		t.Error("logged record did not include the resolved actor's id")
	}
}
