package service

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// RecordClientError logs a frontend crash or failed API call at Warn level
// (add-frontend-error-reporting design.md D2) — pure visibility, mirroring
// dispatchWebhooks' existing failure-logging shape exactly, never
// persisted. A missing resolved actor is not itself an error here (unlike
// RecordResult): a report can legitimately arrive from any authenticated
// context, and the log line is still useful without one.
func (s *Service) RecordClientError(ctx context.Context, report domain.ClientErrorReport) error {
	if report.Message == "" {
		return invalid("message is required")
	}

	attrs := []any{
		"kind", report.Kind,
		"message", report.Message,
	}
	if report.URL != "" {
		attrs = append(attrs, "url", report.URL)
	}
	if report.Method != "" {
		attrs = append(attrs, "method", report.Method)
	}
	if report.Path != "" {
		attrs = append(attrs, "path", report.Path)
	}
	if report.Status != 0 {
		attrs = append(attrs, "status", report.Status)
	}
	if actor, ok := domain.ActorFromContext(ctx); ok {
		attrs = append(attrs, "actorId", actor.ID, "actorKind", actor.Kind)
	}

	s.logger.Warn("frontend client error", attrs...)
	return nil
}
