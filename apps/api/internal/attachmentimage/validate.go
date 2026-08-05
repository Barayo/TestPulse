// Package attachmentimage validates a screenshot uploaded as a run result
// attachment. Unlike avatarimage, it never crops, resizes, or re-encodes —
// evidence images are stored exactly as uploaded (add-run-item-screenshot-
// attachments design.md).
package attachmentimage

import (
	"bytes"
	"errors"
	"image"
	_ "image/jpeg" // registers the "jpeg" format with image.DecodeConfig
	_ "image/png"  // registers the "png" format with image.DecodeConfig

	_ "golang.org/x/image/webp" // registers the "webp" format with image.DecodeConfig
)

// MaxUploadBytes is the largest attachment this package will accept.
// Enforced before any decoding happens, so an oversized upload never
// reaches the image decoders regardless of what it claims to be.
const MaxUploadBytes = 5 * 1024 * 1024

var (
	ErrTooLarge          = errors.New("attachment exceeds the maximum allowed size")
	ErrUnsupportedFormat = errors.New("attachment is not a supported image format (JPEG, PNG, or WebP)")

	formatContentTypes = map[string]string{
		"jpeg": "image/jpeg",
		"png":  "image/png",
		"webp": "image/webp",
	}
)

// ValidateUpload checks that data is a well-formed PNG, JPEG, or WebP image
// within MaxUploadBytes, returning its content type. It does not decode,
// transform, or re-encode the image — the caller stores data unchanged.
func ValidateUpload(data []byte) (string, error) {
	if len(data) > MaxUploadBytes {
		return "", ErrTooLarge
	}

	_, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return "", ErrUnsupportedFormat
	}

	contentType, ok := formatContentTypes[format]
	if !ok {
		return "", ErrUnsupportedFormat
	}
	return contentType, nil
}
