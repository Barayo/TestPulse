package service

import "net"

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
