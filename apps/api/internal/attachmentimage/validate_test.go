package attachmentimage_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentimage"
)

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("reading testdata/%s: %v", name, err)
	}
	return data
}

func TestValidateUpload_RejectsOversizedInput(t *testing.T) {
	data := readTestdata(t, "too-large.jpg")

	_, err := attachmentimage.ValidateUpload(data)

	if !errors.Is(err, attachmentimage.ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
}

func TestValidateUpload_RejectsUnsupportedFormat(t *testing.T) {
	data := readTestdata(t, "not-an-image.txt")

	_, err := attachmentimage.ValidateUpload(data)

	if !errors.Is(err, attachmentimage.ErrUnsupportedFormat) {
		t.Fatalf("expected ErrUnsupportedFormat, got %v", err)
	}
}

func TestValidateUpload_AcceptsSupportedFormats(t *testing.T) {
	cases := []struct {
		file        string
		contentType string
	}{
		{"sample.jpg", "image/jpeg"},
		{"sample.png", "image/png"},
		{"sample.webp", "image/webp"},
	}

	for _, tc := range cases {
		t.Run(tc.file, func(t *testing.T) {
			data := readTestdata(t, tc.file)

			contentType, err := attachmentimage.ValidateUpload(data)

			if err != nil {
				t.Fatalf("ValidateUpload(%s): unexpected error: %v", tc.file, err)
			}
			if contentType != tc.contentType {
				t.Fatalf("ValidateUpload(%s): got content type %q, want %q", tc.file, contentType, tc.contentType)
			}
		})
	}
}

func TestValidateUpload_DoesNotAlterInput(t *testing.T) {
	data := readTestdata(t, "sample.jpg")
	original := append([]byte(nil), data...)

	if _, err := attachmentimage.ValidateUpload(data); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if string(data) != string(original) {
		t.Fatalf("ValidateUpload must not mutate or transform the input bytes")
	}
}
