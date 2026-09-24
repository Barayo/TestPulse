package service_test

import (
	"context"
	"log/slog"
	"sync"
)

// recordingHandler is a minimal slog.Handler that records every record it
// receives, for asserting on log output in tests without parsing stdout
// (add-service-request-logging).
type recordingHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func (h *recordingHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *recordingHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = append(h.records, r)
	return nil
}

func (h *recordingHandler) WithAttrs(_ []slog.Attr) slog.Handler { return h }

func (h *recordingHandler) WithGroup(_ string) slog.Handler { return h }

// messages returns the message text of every record seen so far.
func (h *recordingHandler) messages() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	msgs := make([]string, len(h.records))
	for i, r := range h.records {
		msgs[i] = r.Message
	}
	return msgs
}

// attrs returns the attributes of the first record with the given message,
// as a map. Returns nil if no such record was recorded.
func (h *recordingHandler) attrs(msg string) map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, r := range h.records {
		if r.Message != msg {
			continue
		}
		out := make(map[string]any, r.NumAttrs())
		r.Attrs(func(a slog.Attr) bool {
			out[a.Key] = a.Value.Any()
			return true
		})
		return out
	}
	return nil
}
