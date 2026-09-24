package importer

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
)

// ClassifyImportError turns an internal, multiply-wrapped Go error (network
// failures, HTTP status text, decode errors — see poller.go's runXxxJob
// helpers, every one of which wraps through fmt.Errorf("...: %w", err) at
// least once, several including the job's own internal ID) into a short,
// stable, user-appropriate message: a general failure category plus
// actionable next step, never the underlying error chain, a Go type/
// function name, or any internal identifier
// (fix-import-wizard-orphaned-projects design.md D4). Called once, in
// poller.go's Once, right before the message is persisted — the single
// choke point every source's failure funnels through, so no future source
// can reintroduce raw-error leakage by omission.
func ClassifyImportError(source string, err error) string {
	if isNetworkError(err) {
		return fmt.Sprintf("Could not reach %s. Check the site URL and that it's publicly reachable.", source)
	}
	msg := err.Error()
	if containsAny(msg, "401", "403", "unauthorized", "forbidden") {
		return "Authentication failed. Check your credentials and try again."
	}
	if containsAny(msg, "404", "not found") {
		return "The configured project/board wasn't found. Check the project/site details."
	}
	return "The import failed unexpectedly. Try again, or check the connector logs for details."
}

func isNetworkError(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr)
}

func containsAny(haystack string, needles ...string) bool {
	lower := strings.ToLower(haystack)
	for _, n := range needles {
		if strings.Contains(lower, strings.ToLower(n)) {
			return true
		}
	}
	return false
}
