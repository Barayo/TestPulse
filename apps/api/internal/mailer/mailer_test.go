package mailer_test

import (
	"context"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/mailer"
)

// fakeSender proves Sender is a real interface other packages can
// substitute in tests (add-forgot-password task 4.1 relies on this).
type fakeSender struct {
	to, subject, body string
}

func (f *fakeSender) Send(_ context.Context, to, subject, body string) error {
	f.to, f.subject, f.body = to, subject, body
	return nil
}

func TestFakeSenderSatisfiesInterface(t *testing.T) {
	var s mailer.Sender = &fakeSender{}
	if err := s.Send(context.Background(), "a@example.com", "subj", "body"); err != nil {
		t.Fatalf("Send: %v", err)
	}
}

func TestBuildMessageIncludesHeadersAndBody(t *testing.T) {
	msg := mailer.BuildMessage("user@example.com", "noreply@testpulse.local", "Reset your password", "Click here: https://example.com/reset?token=abc")
	text := string(msg)
	if !strings.Contains(text, "To: user@example.com") {
		t.Errorf("message missing To header: %q", text)
	}
	if !strings.Contains(text, "From: noreply@testpulse.local") {
		t.Errorf("message missing From header: %q", text)
	}
	if !strings.Contains(text, "Subject: Reset your password") {
		t.Errorf("message missing Subject header: %q", text)
	}
	if !strings.Contains(text, "Click here: https://example.com/reset?token=abc") {
		t.Errorf("message missing body: %q", text)
	}
}
