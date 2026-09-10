package domain

import "testing"

func TestSlugify(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"simple name", "Authentication", "authentication"},
		{"name with spaces", "Two Factor", "two-factor"},
		{"name with special characters", "API (v2)!!", "api-v2"},
		{"leading/trailing whitespace trimmed", "  Settings  ", "settings"},
		{"repeated separators collapse to one hyphen", "A---B   C", "a-b-c"},
		{"name with no slugifiable characters is empty", "\U0001F389\U0001F389\U0001F389", ""},
		{"pure punctuation is empty", "···", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Slugify(c.in); got != c.want {
				t.Errorf("Slugify(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestSlugifyWhitespaceAndHyphenVariantsCollide(t *testing.T) {
	a, b := Slugify("Two Factor"), Slugify("Two-Factor")
	if a != b {
		t.Errorf("Slugify(%q) = %q, Slugify(%q) = %q, want equal", "Two Factor", a, "Two-Factor", b)
	}
}

func TestSlugifyCaseVariantsCollide(t *testing.T) {
	a, b := Slugify("Auth"), Slugify("auth")
	if a != b {
		t.Errorf("Slugify(%q) = %q, Slugify(%q) = %q, want equal", "Auth", a, "auth", b)
	}
}

// A decomposed Unicode form (base letter + combining accent) must slugify
// identically to its precomposed equivalent (single accented codepoint) —
// without NFKC normalization first, the decomposed form's base letter
// survives the strip (only the combining mark is dropped) while the
// precomposed form's whole accented character is dropped, producing two
// different slugs for visually identical text.
func TestSlugifyNFKCEquivalentFormsCollide(t *testing.T) {
	precomposed := "café"        // café, é as a single precomposed codepoint
	decomposed := "café"        // café, base letter e + combining acute accent
	a, b := Slugify(precomposed), Slugify(decomposed)
	if a != b {
		t.Errorf("Slugify(precomposed) = %q, Slugify(decomposed) = %q, want equal", a, b)
	}
}
