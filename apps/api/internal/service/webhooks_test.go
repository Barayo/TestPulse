package service_test

import (
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func TestValidateWebhookURLRejectsNonHTTPS(t *testing.T) {
	if err := service.ValidateWebhookURL("http://example.com/hooks/one"); err == nil {
		t.Error("ValidateWebhookURL(http://...) = nil, want a validation error")
	}
}

func TestValidateWebhookURLRejectsLocalhost(t *testing.T) {
	if err := service.ValidateWebhookURL("https://localhost/hooks/one"); err == nil {
		t.Error("ValidateWebhookURL(https://localhost/...) = nil, want a validation error")
	}
}

func TestValidateWebhookURLRejectsPrivateRanges(t *testing.T) {
	cases := []string{
		"https://127.0.0.1/hooks",
		"https://10.0.0.5/hooks",
		"https://172.16.0.5/hooks",
		"https://192.168.1.5/hooks",
		"https://169.254.0.5/hooks",
	}
	for _, u := range cases {
		if err := service.ValidateWebhookURL(u); err == nil {
			t.Errorf("ValidateWebhookURL(%q) = nil, want a validation error", u)
		}
	}
}

func TestValidateWebhookURLAcceptsPublicHTTPS(t *testing.T) {
	if err := service.ValidateWebhookURL("https://hooks.slack.com/services/T00/B00/xyz"); err != nil {
		t.Errorf("ValidateWebhookURL(valid public https) = %v, want nil", err)
	}
}

func TestValidateWebhookURLRejectsMalformedURL(t *testing.T) {
	if err := service.ValidateWebhookURL("not a url"); err == nil {
		t.Error("ValidateWebhookURL(malformed) = nil, want a validation error")
	}
}

// Luis's security review (add-run-notifications tasks.md 12.1) confirmed
// url.Parse's Hostname() preserves case and trailing dots, so a
// case-sensitive exact match against "localhost" silently let
// "LOCALHOST" and "localhost." (an FQDN form) through.
func TestValidateWebhookURLRejectsLocalhostCaseAndTrailingDotVariants(t *testing.T) {
	cases := []string{
		"https://LOCALHOST/hooks",
		"https://localhost./hooks",
		"https://LocalHost./hooks",
	}
	for _, u := range cases {
		if err := service.ValidateWebhookURL(u); err == nil {
			t.Errorf("ValidateWebhookURL(%q) = nil, want a validation error", u)
		}
	}
}
