package server

import (
	"context"
	"net/http"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func (h *api) getInstanceSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.InstanceSettings(r.Context())
	h.respond(w, http.StatusOK, settings, err)
}

type instanceSettingsUpdateInput struct {
	PublicProjectsEnabled   *bool                 `json:"publicProjectsEnabled"`
	RunRetentionDays        *int                  `json:"runRetentionDays"`
	AutoArchiveInactiveDays *int                  `json:"autoArchiveInactiveDays"`
	ColorTheme              *string               `json:"colorTheme"`
	CustomPalette           *domain.CustomPalette `json:"customPalette"`
	OIDCIssuer              *string               `json:"oidcIssuer"`
	OIDCClientID            *string               `json:"oidcClientId"`
	OIDCClientSecret        *string               `json:"oidcClientSecret"`
	OIDCGroupClaim          *string               `json:"oidcGroupClaim"`
	OIDCAdminClaimValues    *[]string             `json:"oidcAdminClaimValues"`
	OIDCOnly                *bool                 `json:"oidcOnly"`
	DisableSso              *bool                 `json:"disableSso"`
	JiraSiteURL             *string               `json:"jiraSiteUrl"`
}

func (in instanceSettingsUpdateInput) empty() bool {
	return in.PublicProjectsEnabled == nil && in.RunRetentionDays == nil &&
		in.AutoArchiveInactiveDays == nil && in.ColorTheme == nil && in.CustomPalette == nil &&
		in.OIDCIssuer == nil && in.OIDCClientID == nil && in.OIDCClientSecret == nil &&
		in.OIDCGroupClaim == nil && in.OIDCAdminClaimValues == nil && in.OIDCOnly == nil && in.DisableSso == nil &&
		in.JiraSiteURL == nil
}

// touchesOIDCConnection reports whether this request changes the values an
// OIDCAuthenticator is actually built from (issuer/client ID/secret) —
// only then does the handler need to attempt discovery before persisting
// (design.md D8). Changing only the group claim, admin values, or SSO-only
// doesn't require rebuilding the authenticator at all.
func (in instanceSettingsUpdateInput) touchesOIDCConnection() bool {
	return in.OIDCIssuer != nil || in.OIDCClientID != nil || in.OIDCClientSecret != nil
}

func (h *api) updateInstanceSettings(w http.ResponseWriter, r *http.Request) {
	in, err := decode[instanceSettingsUpdateInput](r)
	if err != nil || in.empty() {
		badBody(h, w)
		return
	}

	if in.DisableSso != nil && *in.DisableSso {
		settings, err := h.svc.UpdateInstanceSettings(r.Context(), domain.InstanceSettingsUpdate{DisableOIDC: in.DisableSso})
		if err != nil {
			h.respond(w, 0, nil, err)
			return
		}
		h.oidcManager.Set(nil)
		h.respond(w, http.StatusOK, settings, nil)
		return
	}

	if in.touchesOIDCConnection() {
		auth, err := h.buildProposedOIDCAuthenticator(r.Context(), in)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "could not reach the OIDC issuer's discovery document: " + err.Error(),
			})
			return
		}
		settings, err := h.svc.UpdateInstanceSettings(r.Context(), toInstanceSettingsUpdate(in))
		if err != nil {
			h.respond(w, 0, nil, err)
			return
		}
		h.oidcManager.Set(auth)
		h.respond(w, http.StatusOK, settings, nil)
		return
	}

	settings, err := h.svc.UpdateInstanceSettings(r.Context(), toInstanceSettingsUpdate(in))
	h.respond(w, http.StatusOK, settings, err)
}

// buildProposedOIDCAuthenticator discovers the provider for the *proposed*
// merged issuer/client ID/client secret — before anything is persisted
// (design.md D8), so a bad issuer is rejected immediately rather than
// silently breaking login later. A client secret omitted from this request
// falls back to the currently-stored, decrypted one.
func (h *api) buildProposedOIDCAuthenticator(ctx context.Context, in instanceSettingsUpdateInput) (*OIDCAuthenticator, error) {
	current, err := h.svc.InstanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	issuer, clientID, groupClaim := current.OIDCIssuer, current.OIDCClientID, current.OIDCGroupClaim
	if in.OIDCIssuer != nil {
		issuer = *in.OIDCIssuer
	}
	if in.OIDCClientID != nil {
		clientID = *in.OIDCClientID
	}
	if in.OIDCGroupClaim != nil {
		groupClaim = *in.OIDCGroupClaim
	}
	secret := ""
	if in.OIDCClientSecret != nil {
		secret = *in.OIDCClientSecret
	} else {
		decrypted, ok, err := h.svc.DecryptedOIDCClientSecret(ctx)
		if err != nil {
			return nil, err
		}
		if ok {
			secret = decrypted
		}
	}
	return NewOIDCAuthenticator(ctx, OIDCAuthenticatorConfig{
		Issuer: issuer, ClientID: clientID, ClientSecret: secret,
		PublicURL: h.publicURL, GroupClaim: groupClaim, StateSigningKey: h.encryptionKey,
	})
}

func toInstanceSettingsUpdate(in instanceSettingsUpdateInput) domain.InstanceSettingsUpdate {
	return domain.InstanceSettingsUpdate{
		PublicProjectsEnabled:   in.PublicProjectsEnabled,
		RunRetentionDays:        in.RunRetentionDays,
		AutoArchiveInactiveDays: in.AutoArchiveInactiveDays,
		ColorTheme:              in.ColorTheme,
		CustomPalette:           in.CustomPalette,
		OIDCIssuer:              in.OIDCIssuer,
		OIDCClientID:            in.OIDCClientID,
		OIDCClientSecret:        in.OIDCClientSecret,
		OIDCGroupClaim:          in.OIDCGroupClaim,
		OIDCAdminClaimValues:    in.OIDCAdminClaimValues,
		OIDCOnly:                in.OIDCOnly,
		JiraSiteURL:             in.JiraSiteURL,
	}
}
