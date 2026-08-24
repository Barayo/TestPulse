package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// OIDCClaims is the minimal set of ID-token claims OIDCLogin needs, already
// cryptographically verified (signature, issuer, audience, nonce) by the
// caller — an HTTP handler using go-oidc's ID token verifier. Keeping that
// verification out of this method is what makes account-matching and
// claim-mapping testable without a live or fake IdP. GroupClaimValues feeds
// both the Tenant Admin mapping and the Team mapping (design.md D10) — both
// read the same configured group-claim name, just matched against
// different configured value sets.
type OIDCClaims struct {
	Subject          string
	Email            string
	EmailVerified    bool
	GroupClaimValues []string
}

// OIDCLogin resolves an already-verified OIDC login to a TestPulse account
// (design.md D3: subject match, then verified-email match+link, then
// JIT-provision), applies claim-based Tenant Admin mapping (D5) and
// claim→Team mapping (D10) — both read live from instance_settings/
// oidc_team_mappings, since a Tenant Admin can change them without a
// restart — and creates a session exactly like a password login would.
func (s *Service) OIDCLogin(ctx context.Context, claims OIDCClaims) (domain.Session, domain.User, error) {
	user, err := s.resolveOIDCUser(ctx, claims)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}

	settings, err := s.store.InstanceSettings.Get(ctx)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	if len(settings.OIDCAdminClaimValues) > 0 {
		wantAdmin := matchesAny(claims.GroupClaimValues, settings.OIDCAdminClaimValues)
		if wantAdmin != user.IsTenantAdmin {
			if err := s.store.Users.SetTenantAdmin(ctx, user.ID, wantAdmin); err != nil {
				return domain.Session{}, domain.User{}, err
			}
			user.IsTenantAdmin = wantAdmin
		}
	}

	if err := s.syncOIDCTeamMappings(ctx, user.ID, claims.GroupClaimValues); err != nil {
		return domain.Session{}, domain.User{}, err
	}

	sess, err := s.createSession(ctx, user.ID)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	return sess, user, nil
}

// syncOIDCTeamMappings adds userID to every Team whose configured claim
// value appears in groupClaimValues (design.md D10) — additive only, never
// removes existing membership, whether granted by a prior sync or by an
// admin directly.
func (s *Service) syncOIDCTeamMappings(ctx context.Context, userID string, groupClaimValues []string) error {
	mappings, err := s.store.OIDCTeamMappings.List(ctx)
	if err != nil {
		return err
	}
	for _, m := range mappings {
		if !matchesAny(groupClaimValues, []string{m.ClaimValue}) {
			continue
		}
		if err := s.store.Teams.AddMember(ctx, m.TeamID, userID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) resolveOIDCUser(ctx context.Context, claims OIDCClaims) (domain.User, error) {
	if user, ok, err := s.store.Users.GetByOIDCSubject(ctx, claims.Subject); err != nil {
		return domain.User{}, err
	} else if ok {
		return user, nil
	}

	// An unverified email is rejected outright, whether or not it collides
	// with an existing account. Trusting it for a brand-new account is just
	// as risky as trusting it to link an existing one: any identity
	// provider that lets a user self-assert an arbitrary, unverified email
	// (open-registration/self-service IdPs commonly do) would otherwise let
	// an attacker squat a colleague's real email — e.g. an admin's —
	// before that colleague ever logs in via SSO themselves.
	if !claims.EmailVerified {
		return domain.User{}, unauthorized("identity provider did not verify this email address")
	}

	existing, _, err := s.store.Users.GetByEmailWithHash(ctx, claims.Email)
	switch {
	case err == nil:
		if err := s.store.Users.LinkOIDCSubject(ctx, existing.ID, claims.Subject); err != nil {
			if errors.Is(err, store.ErrOIDCSubjectAlreadyLinked) {
				return domain.User{}, unauthorized("account is already linked to a different oidc subject")
			}
			return domain.User{}, err
		}
		return existing, nil
	case errors.Is(err, store.ErrNotFound):
		// No existing account holds this (already verified) email — safe
		// to provision a new one.
	default:
		return domain.User{}, err
	}

	user, err := s.store.Users.CreateSSO(ctx, claims.Email, claims.Subject)
	if err != nil {
		return domain.User{}, err
	}
	// Same default-display-name derivation as a Tenant-Admin-created
	// account (Service.CreateUser) — a real starting name, not permanently
	// unset (design.md).
	defaultName := domain.DefaultDisplayName(claims.Email)
	return s.store.Users.UpdateProfile(ctx, user.ID, domain.UserProfileUpdate{DisplayName: &defaultName})
}

func matchesAny(values, configured []string) bool {
	for _, v := range values {
		for _, c := range configured {
			if v == c {
				return true
			}
		}
	}
	return false
}

// oidcStatePayload is what signOIDCState/verifyOIDCState carry through the
// IdP's `state` round trip (design.md D2) — the PKCE verifier and the
// ID-token nonce, plus an expiry, HMAC-signed rather than stored
// server-side.
type oidcStatePayload struct {
	Verifier string `json:"v"`
	Nonce    string `json:"n"`
	Exp      int64  `json:"e"`
}

// signOIDCState packs the PKCE verifier and nonce into a base64url payload
// signed with an HMAC-SHA256 keyed by the OIDC client secret (already a
// server-only secret, required for OIDC to be enabled at all — see
// design.md D2 for why this avoids a new server-side state store).
func signOIDCState(clientSecret, verifier, nonce string, expiresAt time.Time) (string, error) {
	payload, err := json.Marshal(oidcStatePayload{Verifier: verifier, Nonce: nonce, Exp: expiresAt.Unix()})
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmacSum(clientSecret, encodedPayload)
	return encodedPayload + "." + mac, nil
}

// verifyOIDCState recomputes the HMAC before trusting the payload and
// rejects a tampered or expired state exactly like a wrong password is
// rejected elsewhere — no distinction in error handling for the caller.
func verifyOIDCState(clientSecret, state string, now time.Time) (verifier, nonce string, err error) {
	encodedPayload, mac, ok := strings.Cut(state, ".")
	if !ok {
		return "", "", errors.New("malformed oidc state")
	}
	if !hmac.Equal([]byte(mac), []byte(hmacSum(clientSecret, encodedPayload))) {
		return "", "", errors.New("oidc state signature mismatch")
	}
	raw, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return "", "", err
	}
	var payload oidcStatePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", "", err
	}
	if now.After(time.Unix(payload.Exp, 0)) {
		return "", "", errors.New("oidc state expired")
	}
	return payload.Verifier, payload.Nonce, nil
}

// SignOIDCState is signOIDCState, exported for the HTTP handler layer
// (server package) that issues the authorization redirect.
func SignOIDCState(clientSecret, verifier, nonce string, expiresAt time.Time) (string, error) {
	return signOIDCState(clientSecret, verifier, nonce, expiresAt)
}

// VerifyOIDCState is verifyOIDCState, exported for the HTTP handler layer
// (server package) that handles the OIDC callback.
func VerifyOIDCState(clientSecret, state string, now time.Time) (verifier, nonce string, err error) {
	return verifyOIDCState(clientSecret, state, now)
}

// OIDCStateTTL is oidcStateTTL, exported for the HTTP handler layer.
const OIDCStateTTL = oidcStateTTL

func hmacSum(key, message string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(message))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// oidcStateTTL is how long a signed state (and the PKCE attempt it
// represents) remains valid — long enough for a person to authenticate at
// their IdP, short enough that a leaked/logged callback URL stops being
// useful quickly.
const oidcStateTTL = 10 * time.Minute
