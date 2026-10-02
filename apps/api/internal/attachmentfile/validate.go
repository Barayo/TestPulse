// Package attachmentfile validates a reference file uploaded against a test
// case — an image, a PDF, or a plain-text file (add-case-reference-
// attachments design.md D2). It extends attachmentimage's image-only check
// with PDF and text paths rather than modifying it, so run-result
// attachments keep their narrower contract. Like attachmentimage, it never
// transforms the upload — a PDF is never parsed or rendered, only sniffed
// for its magic header; text is never reformatted.
package attachmentfile

import (
	"bytes"
	"errors"
	"unicode/utf8"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentimage"
)

// MaxUploadBytes is the largest attachment this package will accept —
// the same ceiling as attachmentimage.
const MaxUploadBytes = 5 * 1024 * 1024

var (
	ErrTooLarge          = errors.New("attachment exceeds the maximum allowed size")
	ErrUnsupportedFormat = errors.New("attachment is not a supported file type (JPEG, PNG, WebP, PDF, or plain text)")

	pdfMagic = []byte("%PDF-")
)

// ValidateUpload checks that data is a well-formed PNG/JPEG/WebP image, a
// PDF document, or plain text (.txt/.log) within MaxUploadBytes, returning
// its content type. It does not decode, transform, or re-encode the file —
// the caller stores data unchanged.
func ValidateUpload(data []byte) (string, error) {
	if len(data) > MaxUploadBytes {
		return "", ErrTooLarge
	}

	if contentType, err := attachmentimage.ValidateUpload(data); err == nil {
		return contentType, nil
	}

	if bytes.HasPrefix(data, pdfMagic) {
		return "application/pdf", nil
	}

	if looksLikeText(data) {
		return "text/plain", nil
	}

	return "", ErrUnsupportedFormat
}

// looksLikeText is the same heuristic a "file" command or browser uses to
// distinguish text from binary: valid UTF-8 with no NUL bytes. There's no
// magic header for plain text to sniff, so this is the closest equivalent
// — it accepts both .txt and .log uploads without needing the filename
// (ValidateUpload stays filename-agnostic, matching attachmentimage).
func looksLikeText(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	if !utf8.Valid(data) {
		return false
	}
	return !bytes.ContainsRune(data, 0)
}
