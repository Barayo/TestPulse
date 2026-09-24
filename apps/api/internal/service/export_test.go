package service

import (
	"context"
	"net"
)

// AllowLoopbackWebhooksForTest disables the dial-time SSRF IP check
// (webhookIPCheck) for the duration of the test, restoring it via
// t.Cleanup-style deferred call. Dispatch tests that need to simulate a
// real webhook destination have no way to stand up an httptest.Server that
// isn't loopback-bound, so — mirroring how those same tests already bypass
// ValidateWebhookURL by writing straight to the store — this bypasses the
// dial-time check too. Tests proving the SSRF guard itself (redirect
// bypass, loopback dial refusal) must NOT call this.
func AllowLoopbackWebhooksForTest() func() {
	orig := webhookIPCheck
	webhookIPCheck = func(net.IP) bool { return false }
	return func() { webhookIPCheck = orig }
}

// AuditForTest calls the package-private audit() directly, so tests can
// exercise its failure-logging behavior (add-service-request-logging)
// without needing a full write flow to trigger it.
func (s *Service) AuditForTest(ctx context.Context, action, entityType, entityID string) {
	s.audit(ctx, action, entityType, entityID)
}
