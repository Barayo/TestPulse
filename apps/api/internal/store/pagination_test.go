package store

import (
	"testing"
	"time"
)

// add-cursor-pagination task 1.1: encodeCursor/decodeCursor round-trip an
// opaque (created_at, id) composite; clampLimit enforces the default/max
// used by every *Page store method.

func TestCursorRoundTrips(t *testing.T) {
	createdAt := time.Date(2026, 9, 7, 12, 30, 0, 0, time.UTC)
	id := "11111111-1111-1111-1111-111111111111"

	cursor := encodeCursor(createdAt, id)
	if cursor == "" {
		t.Fatal("encodeCursor returned empty string")
	}

	gotCreatedAt, gotID, err := decodeCursor(cursor)
	if err != nil {
		t.Fatalf("decodeCursor: %v", err)
	}
	if !gotCreatedAt.Equal(createdAt) {
		t.Errorf("decoded createdAt = %v, want %v", gotCreatedAt, createdAt)
	}
	if gotID != id {
		t.Errorf("decoded id = %q, want %q", gotID, id)
	}
}

func TestDecodeCursorRejectsMalformedInput(t *testing.T) {
	for _, bad := range []string{
		"",
		"not-base64!!!",
		"aGVsbG8=",          // valid base64, but not JSON
		"eyJmb28iOiJiYXIifQ==", // valid base64 JSON, but missing createdAt/id
	} {
		if _, _, err := decodeCursor(bad); err == nil {
			t.Errorf("decodeCursor(%q) = nil error, want an error", bad)
		}
	}
}

func TestRankedCursorRoundTrips(t *testing.T) {
	createdAt := time.Date(2026, 9, 7, 12, 30, 0, 0, time.UTC)
	id := "22222222-2222-2222-2222-222222222222"

	cursor := encodeCursorWithRank(2, createdAt, id)
	if cursor == "" {
		t.Fatal("encodeCursorWithRank returned empty string")
	}

	gotRank, gotCreatedAt, gotID, err := decodeCursorWithRank(cursor)
	if err != nil {
		t.Fatalf("decodeCursorWithRank: %v", err)
	}
	if gotRank != 2 {
		t.Errorf("decoded rank = %d, want 2", gotRank)
	}
	if !gotCreatedAt.Equal(createdAt) {
		t.Errorf("decoded createdAt = %v, want %v", gotCreatedAt, createdAt)
	}
	if gotID != id {
		t.Errorf("decoded id = %q, want %q", gotID, id)
	}
}

func TestDecodeCursorWithRankRejectsMalformedInput(t *testing.T) {
	for _, bad := range []string{"", "not-base64!!!", "aGVsbG8="} {
		if _, _, _, err := decodeCursorWithRank(bad); err == nil {
			t.Errorf("decodeCursorWithRank(%q) = nil error, want an error", bad)
		}
	}
}

func TestClampLimit(t *testing.T) {
	cases := []struct {
		in, want int
	}{
		{0, 50},
		{-1, 50},
		{-1000, 50},
		{1, 1},
		{50, 50},
		{200, 200},
		{201, 200},
		{999999, 200},
	}
	for _, c := range cases {
		if got := clampLimit(c.in); got != c.want {
			t.Errorf("clampLimit(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}
