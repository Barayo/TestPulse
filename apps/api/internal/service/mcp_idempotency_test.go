package service_test

import (
	"context"
	"testing"
)

func TestIdempotentResultMissReturnsFalse(t *testing.T) {
	s := testService(t)
	ctx := context.Background()

	_, ok, err := s.IdempotentResult(ctx, "actor1", "create_test_run", "no-such-key")
	if err != nil {
		t.Fatalf("IdempotentResult: %v", err)
	}
	if ok {
		t.Error("IdempotentResult ok = true for a key that was never saved, want false")
	}
}

func TestSaveThenIdempotentResultReturnsStoredValue(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	type result struct {
		ID string `json:"id"`
	}

	if err := s.SaveIdempotentResult(ctx, "actor1", "create_test_run", "k1", result{ID: "run1"}); err != nil {
		t.Fatalf("SaveIdempotentResult: %v", err)
	}

	raw, ok, err := s.IdempotentResult(ctx, "actor1", "create_test_run", "k1")
	if err != nil {
		t.Fatalf("IdempotentResult: %v", err)
	}
	if !ok {
		t.Fatal("IdempotentResult ok = false, want true")
	}
	if string(raw) == "" {
		t.Fatal("IdempotentResult returned empty result")
	}
}
