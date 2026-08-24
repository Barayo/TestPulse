package server_test

import (
	"context"
	"log/slog"
	"net/http"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// ssoSettingsServer builds a server with a real encryption key wired and a
// bootstrap admin's cookie ready, plus the OIDCManager itself so a test can
// confirm whether PATCH /instance-settings actually swapped it.
func ssoSettingsServer(t *testing.T) (h http.Handler, admin string, manager *server.OIDCManager) {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool)).WithEncryptionKey("a-real-encryption-key")
	manager = server.NewOIDCManager()
	handler := server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, &server.SSOConfig{
		Manager: manager, PublicURL: "https://testpulse.example.com", EncryptionKey: "a-real-encryption-key",
	})
	if err := svc.BootstrapAdmin(context.Background(), "sso-settings-admin@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	admin = loginCookie(t, handler, "sso-settings-admin@example.com", "correcthorse")
	return handler, admin, manager
}
