package domain

import (
	"regexp"
	"strings"

	"golang.org/x/text/unicode/norm"
)

var (
	nonAlnumRun = regexp.MustCompile(`[^a-z0-9]+`)
	edgeHyphens = regexp.MustCompile(`^-+|-+$`)
)

// Slugify derives a URL-safe routing slug from a folder name (add-folder-
// slug-urls): NFKC-normalize first (so a byte-distinct but visually
// identical Unicode composition of the same characters — e.g. a
// precomposed accented letter vs. base letter + combining accent —
// produces the same slug either way), lowercase, strip anything outside
// a-z0-9, collapse runs of stripped characters into a single hyphen, trim
// leading/trailing hyphens. Returns "" when the name has no slugifiable
// characters (e.g. emoji-only, pure punctuation) — ValidateFolderName
// rejects such a name outright rather than falling back to a meaningless
// slug.
func Slugify(name string) string {
	normalized := norm.NFKC.String(strings.TrimSpace(name))
	lowered := strings.ToLower(normalized)
	hyphenated := nonAlnumRun.ReplaceAllString(lowered, "-")
	return edgeHyphens.ReplaceAllString(hyphenated, "")
}
