package server_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
)

// fakeIdP is a minimal, real OIDC provider for tests: it serves a
// discovery document, a JWKS endpoint, and a /token endpoint that mints a
// signed ID token from whatever claims the test configures next — the same
// technique go-oidc's own client library expects any real IdP to satisfy,
// so verifying against it exercises the real discovery/signature/issuer/
// audience checks rather than a hand-rolled stand-in for them.
type fakeIdP struct {
	server      *httptest.Server
	key         *rsa.PrivateKey
	kid         string
	nextClaims  map[string]any
	tokenCalled int
}

func newFakeIdP(t *testing.T) *fakeIdP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating test RSA key: %v", err)
	}
	f := &fakeIdP{key: key, kid: "test-key-1"}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", f.discovery)
	mux.HandleFunc("/keys", f.jwks)
	mux.HandleFunc("/authorize", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not used by these tests", http.StatusNotImplemented)
	})
	mux.HandleFunc("/token", f.token)
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeIdP) discovery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"issuer":                                f.server.URL,
		"authorization_endpoint":                f.server.URL + "/authorize",
		"token_endpoint":                        f.server.URL + "/token",
		"jwks_uri":                              f.server.URL + "/keys",
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
	})
}

func (f *fakeIdP) jwks(w http.ResponseWriter, r *http.Request) {
	set := jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{
		Key:       &f.key.PublicKey,
		KeyID:     f.kid,
		Algorithm: "RS256",
		Use:       "sig",
	}}}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(set)
}

// withNextIDTokenClaims configures the claims the next /token call's ID
// token will carry, merged over sensible defaults (iss/aud/iat/exp/sub).
func (f *fakeIdP) withNextIDTokenClaims(claims map[string]any) *fakeIdP {
	merged := map[string]any{
		"iss": f.server.URL,
		"sub": "default-subject",
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(5 * time.Minute).Unix(),
	}
	for k, v := range claims {
		merged[k] = v
	}
	f.nextClaims = merged
	return f
}

func (f *fakeIdP) token(w http.ResponseWriter, r *http.Request) {
	f.tokenCalled++
	claims := f.nextClaims
	if claims == nil {
		claims = map[string]any{
			"iss": f.server.URL, "sub": "default-subject",
			"iat": time.Now().Unix(), "exp": time.Now().Add(5 * time.Minute).Unix(),
		}
	}
	// aud must match the client_id sent in the token request, per spec.
	// oauth2.Config.Exchange sends client credentials via HTTP Basic auth
	// by default, not the form body, so that's checked first.
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if _, ok := claims["aud"]; !ok {
		if clientID, _, ok := r.BasicAuth(); ok && clientID != "" {
			claims["aud"] = clientID
		} else {
			claims["aud"] = r.PostForm.Get("client_id")
		}
	}

	idToken, err := f.signIDToken(claims)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token": "fake-access-token",
		"token_type":   "Bearer",
		"id_token":     idToken,
		"expires_in":   3600,
	})
}

func (f *fakeIdP) signIDToken(claims map[string]any) (string, error) {
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: f.key}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", f.kid))
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	jws, err := signer.Sign(payload)
	if err != nil {
		return "", err
	}
	return jws.CompactSerialize()
}
