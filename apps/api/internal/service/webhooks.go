package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// isDisallowedWebhookIP is the actual SSRF boundary (add-run-notifications
// design.md Risks): shared by ValidateWebhookURL (a config-time sanity
// check, for immediate feedback) and webhookHTTPClient's dial hook (the
// real enforcement point, since it runs against the IP about to be
// connected to — see webhookHTTPClient for why that distinction matters).
//
// dialWebhookDestination calls this through the webhookIPCheck package var,
// not directly, so tests can swap it out (see export_test.go's
// AllowLoopbackWebhooksForTest): httptest.Server always binds to loopback,
// so dispatch tests simulating a legitimate destination need the same
// bypass this package's dispatch tests already use for ValidateWebhookURL
// (writing straight to the store), applied to the dial-time check too.
func isDisallowedWebhookIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

var webhookIPCheck = isDisallowedWebhookIP

// ValidateWebhookURL rejects a destination URL that isn't https, or whose
// hostname is a disallowed literal IP or "localhost" in any of its case or
// trailing-dot FQDN forms (Luis's security review, tasks.md 12.1, found the
// original case-sensitive exact match let "LOCALHOST" and "localhost."
// through). This is a config-time UX check only — it does not resolve
// arbitrary DNS hostnames, so it cannot by itself defend against a
// hostname-form destination whose A record simply points at an internal
// address, let alone DNS rebinding after validation. The actual security
// boundary is webhookHTTPClient's dial-time IP check below, which runs on
// every connection attempt (including redirect hops) against the address
// actually being connected to, not the URL string that was configured.
func ValidateWebhookURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return invalid("webhook URL is not a valid URL")
	}
	if u.Scheme != "https" {
		return invalid("webhook URL must use https")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" {
		return invalid("webhook URL may not point to localhost")
	}
	if ip := net.ParseIP(host); ip != nil && isDisallowedWebhookIP(ip) {
		return invalid("webhook URL may not point to a private, loopback, or link-local address")
	}
	return nil
}

// AddWebhookDestination validates and stores a new project-scoped webhook
// destination (design.md D1-D3). Permission (manageProject) is enforced by
// the HTTP layer's requirePermission middleware, matching this codebase's
// existing project-settings convention — not re-checked here.
func (s *Service) AddWebhookDestination(ctx context.Context, projectID, rawURL string) (domain.WebhookDestination, error) {
	if err := ValidateWebhookURL(rawURL); err != nil {
		return domain.WebhookDestination{}, err
	}
	d, err := s.store.Webhooks.Create(ctx, projectID, rawURL)
	if err != nil {
		return domain.WebhookDestination{}, err
	}
	s.audit(ctx, "create", "webhookDestination", d.ID)
	return d, nil
}

func (s *Service) ListWebhookDestinations(ctx context.Context, projectID string) ([]domain.WebhookDestination, error) {
	return s.store.Webhooks.ListByProject(ctx, projectID)
}

func (s *Service) RemoveWebhookDestination(ctx context.Context, id string) error {
	if err := s.store.Webhooks.Delete(ctx, id); err != nil {
		return err
	}
	s.audit(ctx, "delete", "webhookDestination", id)
	return nil
}

// webhookHTTPClient has a short, bounded timeout so a slow or dead
// destination can never meaningfully delay the write that triggered it
// (design.md D4). Its Transport resolves and checks the destination IP at
// dial time — the only point that's safe against both DNS rebinding and a
// redirect hop, since ValidateWebhookURL's config-time check only ever sees
// the URL string, not the address actually being connected to (Luis's
// security review, tasks.md 12.1, reproduced both bypasses live). Redirects
// are refused outright rather than re-validated, since a generic webhook
// receiver has no legitimate reason to redirect delivery.
var webhookHTTPClient = &http.Client{
	Timeout: 3 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
	Transport: &http.Transport{
		DialContext: dialWebhookDestination,
	},
}

func dialWebhookDestination(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	resolved, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	var dialIP net.IP
	for _, r := range resolved {
		if webhookIPCheck(r.IP) {
			return nil, fmt.Errorf("webhook destination %q resolves to a disallowed address", host)
		}
		if dialIP == nil {
			dialIP = r.IP
		}
	}
	if dialIP == nil {
		return nil, errors.New("webhook destination did not resolve to any address")
	}
	dialer := &net.Dialer{Timeout: 3 * time.Second}
	return dialer.DialContext(ctx, network, net.JoinHostPort(dialIP.String(), port))
}

// webhookEvent is the stable, minimal payload envelope every delivery
// carries (design.md D5) — deliberately not a dump of the underlying
// domain object, so the payload contract stays stable as those structs
// evolve. ProjectKey is filled in by dispatchWebhooks itself, not the
// caller, so every call site shares one resolution path.
type webhookEvent struct {
	Event      string    `json:"event"`
	ProjectKey string    `json:"projectKey"`
	EntityKey  string    `json:"entityKey"`
	Title      string    `json:"title"`
	Timestamp  time.Time `json:"timestamp"`
}

// dispatchWebhooks fires event at every destination configured for
// projectID. Call sites invoke this via `go` with a context.WithoutCancel'd
// ctx, not inline: with more than one destination, sequential delivery on
// the request goroutine could add up to len(destinations)*3s to a write
// that design.md D4 promises to never slow down (Luis's security review,
// tasks.md 12.1, caught this — the single-destination case looked fine but
// didn't generalize). A resolution or delivery failure is never surfaced
// anywhere (mirroring audit()'s own failure tolerance) since it now runs
// entirely off the request's own error path.
func (s *Service) dispatchWebhooks(ctx context.Context, projectID string, event webhookEvent) {
	destinations, err := s.store.Webhooks.ListByProject(ctx, projectID)
	if err != nil || len(destinations) == 0 {
		return
	}
	project, err := s.store.Projects.Get(ctx, projectID)
	if err != nil {
		return
	}
	event.ProjectKey = project.Key
	body, err := json.Marshal(event)
	if err != nil {
		return
	}
	for _, d := range destinations {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.URL, bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := webhookHTTPClient.Do(req)
		if err != nil {
			continue
		}
		_ = resp.Body.Close()
	}
}
