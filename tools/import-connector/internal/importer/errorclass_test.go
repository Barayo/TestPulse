package importer_test

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/tools/import-connector/internal/importer"
)

func TestClassifyImportError(t *testing.T) {
	dialErr := &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connect: connection refused")}
	cases := []struct {
		name string
		err  error
		want string // substring the message must contain
	}{
		{
			name: "network failure wrapped several layers deep",
			err:  fmt.Errorf("listing TestRail case fields: calling TestRail /api/v2/get_case_fields: %w", dialErr),
			want: "could not reach",
		},
		{
			name: "context deadline exceeded",
			err:  fmt.Errorf("calling Qase /custom_fields: %w", context.DeadlineExceeded),
			want: "could not reach",
		},
		{
			name: "401 unauthorized",
			err:  fmt.Errorf("listing Qase case fields: Qase /custom_fields returned 401 Unauthorized"),
			want: "authentication failed",
		},
		{
			name: "403 forbidden",
			err:  fmt.Errorf("TestRail /api/v2/get_case_fields returned 403 Forbidden"),
			want: "authentication failed",
		},
		{
			name: "404 not found",
			err:  fmt.Errorf("Zephyr Scale /folders returned 404 Not Found"),
			want: "wasn't found",
		},
		{
			name: "unrecognized failure falls back to a generic message",
			err:  fmt.Errorf("decoding TestRail case fields: unexpected end of JSON input"),
			want: "failed unexpectedly",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := importer.ClassifyImportError("TestRail", tc.err)
			if !strings.Contains(strings.ToLower(got), tc.want) {
				t.Errorf("ClassifyImportError(%q) = %q, want it to contain %q", tc.err, got, tc.want)
			}
			for _, leaked := range []string{"dial", "tcp", "connection refused", "unexpected end of JSON", tc.err.Error()} {
				if strings.Contains(got, leaked) {
					t.Errorf("ClassifyImportError(%q) = %q, leaked internal text %q", tc.err, got, leaked)
				}
			}
		})
	}
}

func TestClassifyImportErrorNeverLeaksAnInternalJobID(t *testing.T) {
	jobID := "2184557b-12c7-4b9d-933d-42c3b0594ecb"
	err := fmt.Errorf("job %s could not connect to Kiwi TCMS: kiwitcmsclient: login failed: %w", jobID,
		&net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connect: connection refused")})

	got := importer.ClassifyImportError("Kiwi TCMS", err)
	if strings.Contains(got, jobID) {
		t.Errorf("ClassifyImportError leaked the internal job ID: %q", got)
	}
}

func TestClassifyImportErrorNamesTheSource(t *testing.T) {
	got := importer.ClassifyImportError("Kiwi TCMS", fmt.Errorf("dial tcp: %w", &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connection refused")}))
	if !strings.Contains(got, "Kiwi TCMS") {
		t.Errorf("ClassifyImportError(%q) = %q, want it to name the source", "Kiwi TCMS", got)
	}
}

// A network-level error that's also slow to fail (both a timeout and a
// dial failure are network problems, not two different categories) still
// classifies as connectivity, not the generic fallback.
func TestClassifyImportErrorTreatsTimeoutAsConnectivity(t *testing.T) {
	timeoutErr := &net.OpError{Op: "dial", Net: "tcp", Err: timeoutError{}}
	got := importer.ClassifyImportError("TestRail", fmt.Errorf("calling TestRail /api/v2/get_cases: %w", timeoutErr))
	if !strings.Contains(strings.ToLower(got), "could not reach") {
		t.Errorf("ClassifyImportError(timeout) = %q, want a connectivity message", got)
	}
}

type timeoutError struct{}

func (timeoutError) Error() string   { return "i/o timeout" }
func (timeoutError) Timeout() bool   { return true }
func (timeoutError) Temporary() bool { return true }
