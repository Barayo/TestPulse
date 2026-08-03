package avatarimage_test

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/avatarimage"
)

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("reading testdata/%s: %v", name, err)
	}
	return data
}

func TestProcessAvatarUpload_RejectsOversizedInput(t *testing.T) {
	data := readTestdata(t, "too-large.jpg")

	_, err := avatarimage.ProcessAvatarUpload(data)

	if !errors.Is(err, avatarimage.ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
}

func TestProcessAvatarUpload_RejectsUnsupportedFormat(t *testing.T) {
	data := readTestdata(t, "not-an-image.txt")

	_, err := avatarimage.ProcessAvatarUpload(data)

	if !errors.Is(err, avatarimage.ErrUnsupportedFormat) {
		t.Fatalf("expected ErrUnsupportedFormat, got %v", err)
	}
}

func TestProcessAvatarUpload_ProducesFixedSquareJPEG(t *testing.T) {
	for _, name := range []string{"sample.jpg", "sample.png", "sample.webp"} {
		t.Run(name, func(t *testing.T) {
			data := readTestdata(t, name)

			out, err := avatarimage.ProcessAvatarUpload(data)
			if err != nil {
				t.Fatalf("ProcessAvatarUpload(%s): unexpected error: %v", name, err)
			}

			img, format, err := image.Decode(bytes.NewReader(out))
			if err != nil {
				t.Fatalf("output is not a decodable image: %v", err)
			}
			if format != "jpeg" {
				t.Fatalf("expected output format jpeg, got %q", format)
			}
			b := img.Bounds()
			if b.Dx() != avatarimage.OutputSize || b.Dy() != avatarimage.OutputSize {
				t.Fatalf("expected %dx%d output, got %dx%d", avatarimage.OutputSize, avatarimage.OutputSize, b.Dx(), b.Dy())
			}
		})
	}
}

func colorWithin(t *testing.T, img image.Image, x, y int, want color.RGBA, tol int) {
	t.Helper()
	r, g, b, _ := img.At(x, y).RGBA()
	got := color.RGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8)}
	diff := func(a, b uint8) int {
		if a > b {
			return int(a - b)
		}
		return int(b - a)
	}
	if diff(got.R, want.R) > tol || diff(got.G, want.G) > tol || diff(got.B, want.B) > tol {
		t.Errorf("pixel (%d,%d): got %+v, want approximately %+v (tolerance %d)", x, y, got, want, tol)
	}
}

// sample.jpg is a 300x200 image: a red stripe (x:0-100), blue middle
// (x:100-200), green stripe (x:200-300). A center crop to the 200x200
// square (x:50-250) then a resize to 128x128 should still show red on the
// left, blue in the middle, and green on the right of the output.
func TestProcessAvatarUpload_CenterCropsPreservingContent(t *testing.T) {
	data := readTestdata(t, "sample.jpg")

	out, err := avatarimage.ProcessAvatarUpload(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decoding output: %v", err)
	}

	colorWithin(t, img, 15, 64, color.RGBA{R: 200, G: 40, B: 40}, 40)  // left: red
	colorWithin(t, img, 64, 64, color.RGBA{R: 40, G: 120, B: 200}, 40) // middle: blue
	colorWithin(t, img, 112, 64, color.RGBA{R: 40, G: 200, B: 80}, 40) // right: green
}

// sample-exif-rotated.jpg holds the same picture as sample.jpg but stored
// physically rotated, with an EXIF Orientation tag telling a correct reader
// how to undo that rotation. If the pipeline honors EXIF orientation before
// cropping, the output should look the same (red-left/blue-mid/green-right)
// as processing sample.jpg directly — not rotated.
func TestProcessAvatarUpload_HonorsEXIFOrientation(t *testing.T) {
	data := readTestdata(t, "sample-exif-rotated.jpg")

	out, err := avatarimage.ProcessAvatarUpload(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decoding output: %v", err)
	}

	colorWithin(t, img, 15, 64, color.RGBA{R: 200, G: 40, B: 40}, 40)
	colorWithin(t, img, 64, 64, color.RGBA{R: 40, G: 120, B: 200}, 40)
	colorWithin(t, img, 112, 64, color.RGBA{R: 40, G: 200, B: 80}, 40)
}
