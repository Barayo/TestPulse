package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestMCPIdempotencyKeyRepoStoreAndGet(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	result := json.RawMessage(`{"id":"abc"}`)

	if err := s.MCPIdempotencyKeys.Store(ctx, "actor1", "create_test_run", "k1", result, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("Store: %v", err)
	}

	got, err := s.MCPIdempotencyKeys.Get(ctx, "actor1", "create_test_run", "k1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	// jsonb normalizes whitespace on round-trip, so compare parsed values,
	// not raw bytes.
	var gotVal, wantVal map[string]any
	if err := json.Unmarshal(got, &gotVal); err != nil {
		t.Fatalf("unmarshal got: %v", err)
	}
	if err := json.Unmarshal(result, &wantVal); err != nil {
		t.Fatalf("unmarshal want: %v", err)
	}
	if gotVal["id"] != wantVal["id"] {
		t.Errorf("Get = %v, want %v", gotVal, wantVal)
	}
}

func TestMCPIdempotencyKeyRepoGetMissReturnsNotFound(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	if _, err := s.MCPIdempotencyKeys.Get(ctx, "actor1", "create_test_run", "no-such-key"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get(missing) = %v, want ErrNotFound", err)
	}

	// An expired row is treated the same as a miss.
	result := json.RawMessage(`{"id":"abc"}`)
	if err := s.MCPIdempotencyKeys.Store(ctx, "actor1", "create_test_run", "expired", result, time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("Store: %v", err)
	}
	if _, err := s.MCPIdempotencyKeys.Get(ctx, "actor1", "create_test_run", "expired"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get(expired) = %v, want ErrNotFound", err)
	}
}

func TestMCPIdempotencyKeyRepoDeleteExpiredRemovesOnlyExpiredRows(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	result := json.RawMessage(`{"id":"abc"}`)

	if err := s.MCPIdempotencyKeys.Store(ctx, "actor1", "create_test_run", "expired", result, time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("Store expired: %v", err)
	}
	if err := s.MCPIdempotencyKeys.Store(ctx, "actor1", "create_test_run", "live", result, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("Store live: %v", err)
	}

	if err := s.MCPIdempotencyKeys.DeleteExpired(ctx); err != nil {
		t.Fatalf("DeleteExpired: %v", err)
	}

	if _, err := s.MCPIdempotencyKeys.Get(ctx, "actor1", "create_test_run", "expired"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("expired row survived DeleteExpired: err = %v", err)
	}
	if _, err := s.MCPIdempotencyKeys.Get(ctx, "actor1", "create_test_run", "live"); err != nil {
		t.Errorf("live row was removed by DeleteExpired: err = %v", err)
	}
}
