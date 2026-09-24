package service_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// webhookDispatchTestService returns both a Service (to exercise
// RecordResult/CloseRun) and a raw Store backed by the same pool. The raw
// Store is used to configure a webhook destination directly, bypassing
// Service.AddWebhookDestination's SSRF validation (which correctly
// rejects the loopback URLs httptest.Server necessarily binds to) — that
// validation is covered separately in webhooks_test.go; these tests are
// about dispatch behavior, not configuration validation.
func webhookDispatchTestService(t *testing.T) (*service.Service, *store.Store) {
	t.Helper()
	pool := testutil.Pool(t, "webhook_dispatch")
	st := store.New(pool)
	return service.New(st), st
}

func mustWebhookProjectAndItem(t *testing.T, s *service.Service) (projectID, itemID string) {
	t.Helper()
	projectID, _, itemID = mustWebhookProjectRunAndItem(t, s)
	return projectID, itemID
}

func mustWebhookProjectRunAndItem(t *testing.T, s *service.Service) (projectID, runID, itemID string) {
	t.Helper()
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Webhooks"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title: "case", Steps: []domain.Step{{Action: "do it"}}, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) == 0 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	return p.ID, run.ID, items[0].ID
}

// capturingWebhookServer records every request body it receives.
type capturingWebhookServer struct {
	*httptest.Server
	mu    sync.Mutex
	bodies []map[string]any
}

func newCapturingWebhookServer(t *testing.T) *capturingWebhookServer {
	t.Helper()
	c := &capturingWebhookServer{}
	c.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		c.mu.Lock()
		c.bodies = append(c.bodies, body)
		c.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(c.Close)
	return c
}

func (c *capturingWebhookServer) received() []map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]map[string]any, len(c.bodies))
	copy(out, c.bodies)
	return out
}

func TestRecordResultFiresWebhookOnFailedVerdict(t *testing.T) {
	t.Cleanup(service.AllowLoopbackWebhooksForTest())
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	waitForDelivery(t, mock, 1)
	got := mock.received()
	if got[0]["event"] != "result.failed" {
		t.Errorf("event = %v, want result.failed", got[0]["event"])
	}
	for _, field := range []string{"event", "projectKey", "entityKey", "title", "timestamp"} {
		if _, ok := got[0][field]; !ok {
			t.Errorf("payload missing field %q: %+v", field, got[0])
		}
	}
}

func TestRecordResultFiresWebhookOnBlockedVerdict(t *testing.T) {
	t.Cleanup(service.AllowLoopbackWebhooksForTest())
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictBlocked}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	waitForDelivery(t, mock, 1)
	if mock.received()[0]["event"] != "result.blocked" {
		t.Errorf("event = %v, want result.blocked", mock.received()[0]["event"])
	}
}

func TestRecordResultDoesNotFireWebhookOnPassingVerdict(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	time.Sleep(200 * time.Millisecond)
	if got := len(mock.received()); got != 0 {
		t.Errorf("received %d webhook deliveries for a passing verdict, want 0", got)
	}
}

func TestRecordResultSucceedsWhenWebhookDestinationUnreachable(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	// A closed local port: connection refused, not just slow.
	if _, err := st.Webhooks.Create(ctx, projectID, "https://127.0.0.1:1"); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult returned an error for an unreachable webhook destination: %v", err)
	}
}

func TestRecordResultDoesNotBlockOnSlowWebhook(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(slow.Close)
	if _, err := st.Webhooks.Create(ctx, projectID, slow.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	start := time.Now()
	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("RecordResult took %v, want well under the 10s webhook sleep (dispatch must be bounded)", elapsed)
	}
}

func TestCloseRunFiresWebhook(t *testing.T) {
	t.Cleanup(service.AllowLoopbackWebhooksForTest())
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, runID, itemID := mustWebhookProjectRunAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}
	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	if err := s.CloseRun(ctx, runID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}

	waitForDelivery(t, mock, 1)
	if got := mock.received()[0]["event"]; got != "run.closed" {
		t.Errorf("event = %v, want run.closed", got)
	}
}

func TestCloseRunFiresWebhookEvenAtFullPassRate(t *testing.T) {
	t.Cleanup(service.AllowLoopbackWebhooksForTest())
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, runID, itemID := mustWebhookProjectRunAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}
	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	if err := s.CloseRun(ctx, runID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}

	waitForDelivery(t, mock, 1)
}

func TestCloseRunSucceedsWhenWebhookDestinationUnreachable(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, runID, _ := mustWebhookProjectRunAndItem(t, s)
	if _, err := st.Webhooks.Create(ctx, projectID, "https://127.0.0.1:1"); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if err := s.CloseRun(ctx, runID); err != nil {
		t.Fatalf("CloseRun returned an error for an unreachable webhook destination: %v", err)
	}
}

// Luis's security review (add-run-notifications tasks.md 12.1) proved live
// that webhookHTTPClient, being a plain http.Client with no CheckRedirect,
// follows redirects by default — so a destination that legitimately passes
// ValidateWebhookURL could redirect delivery to an internal address entirely
// outside that check's reach. This reproduces his PoC as a regression test.
func TestDispatchDoesNotFollowRedirectToInternalDestination(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)

	internal := newCapturingWebhookServer(t)
	public := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, internal.URL+"/secret", http.StatusFound)
	}))
	t.Cleanup(public.Close)

	if _, err := st.Webhooks.Create(ctx, projectID, public.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	time.Sleep(300 * time.Millisecond)
	if got := len(internal.received()); got != 0 {
		t.Errorf("webhook client followed a redirect to an internal destination: received %d requests, want 0", got)
	}
}

// Proves the dial-time guard actively refuses to connect to a loopback
// address, rather than tests merely happening to pass because an unreachable
// port errors out (TestRecordResultSucceedsWhenWebhookDestinationUnreachable
// uses a closed port, which doesn't distinguish "blocked" from "refused").
// The mock server here is up and would happily respond if dialed.
func TestDispatchRefusesToDialLoopbackDestination(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	time.Sleep(300 * time.Millisecond)
	if got := len(mock.received()); got != 0 {
		t.Errorf("dial-time SSRF guard did not block a reachable loopback destination: received %d requests, want 0", got)
	}
}

// Luis's security review found dispatch is sequential and synchronous on the
// request goroutine: a project with several slow/dead destinations makes
// RecordResult/CloseRun block for up to len(destinations)*3s, violating
// design.md D4's "must never slow down the write" guarantee.
func TestRecordResultDoesNotBlockOnMultipleSlowWebhooks(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	for i := 0; i < 3; i++ {
		slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(5 * time.Second)
			w.WriteHeader(http.StatusOK)
		}))
		t.Cleanup(slow.Close)
		if _, err := st.Webhooks.Create(ctx, projectID, slow.URL); err != nil {
			t.Fatalf("Webhooks.Create: %v", err)
		}
	}

	start := time.Now()
	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 1*time.Second {
		t.Errorf("RecordResult took %v with 3 slow webhook destinations, want well under 1s (dispatch must not block on destination count)", elapsed)
	}
}

func TestDispatchWebhooksLogsAFailedDelivery(t *testing.T) {
	s, st := webhookDispatchTestService(t)
	h := &recordingHandler{}
	s = s.WithLogger(slog.New(h))
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	// A closed local port: connection refused, not just slow.
	if _, err := st.Webhooks.Create(ctx, projectID, "https://127.0.0.1:1"); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	var attrs map[string]any
	for time.Now().Before(deadline) {
		attrs = h.attrs("webhook delivery failed")
		if attrs != nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if attrs == nil {
		t.Fatalf("no \"webhook delivery failed\" log line produced; got messages %v", h.messages())
	}
	if attrs["host"] != "127.0.0.1:1" {
		t.Errorf("host attr = %v, want 127.0.0.1:1", attrs["host"])
	}
	if attrs["event"] != "result.failed" {
		t.Errorf("event attr = %v, want result.failed", attrs["event"])
	}
}

func TestDispatchWebhooksDoesNotLogASuccessfulDelivery(t *testing.T) {
	t.Cleanup(service.AllowLoopbackWebhooksForTest())
	s, st := webhookDispatchTestService(t)
	h := &recordingHandler{}
	s = s.WithLogger(slog.New(h))
	ctx := context.Background()
	projectID, itemID := mustWebhookProjectAndItem(t, s)
	mock := newCapturingWebhookServer(t)
	if _, err := st.Webhooks.Create(ctx, projectID, mock.URL); err != nil {
		t.Fatalf("Webhooks.Create: %v", err)
	}

	if _, err := s.RecordResult(ctx, itemID, domain.NewResult{Actor: "tester", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	waitForDelivery(t, mock, 1)
	if attrs := h.attrs("webhook delivery failed"); attrs != nil {
		t.Errorf("a successful delivery produced a failure log line: %v", attrs)
	}
}

func waitForDelivery(t *testing.T, mock *capturingWebhookServer, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(mock.received()) >= want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %d webhook deliveries, got %d", want, len(mock.received()))
}
