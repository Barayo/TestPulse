package server

import "sync/atomic"

// OIDCManager holds the currently-active OIDCAuthenticator behind an
// atomic pointer (add-sso-oidc design.md D8) — SSO config is Tenant-Admin-
// editable at runtime (D1), so the authenticator built from it must be
// swappable without a restart. A nil current value means SSO isn't
// configured; every read goes through Get().
type OIDCManager struct {
	current atomic.Pointer[OIDCAuthenticator]
}

func NewOIDCManager() *OIDCManager {
	return &OIDCManager{}
}

func (m *OIDCManager) Get() *OIDCAuthenticator {
	return m.current.Load()
}

func (m *OIDCManager) Set(auth *OIDCAuthenticator) {
	m.current.Store(auth)
}
