// Package avatarimage validates and normalizes a user-uploaded avatar photo
// into the single representation ever stored or served: a fixed-size square
// JPEG (add-custom-avatar-upload design.md).
package avatarimage

import (
	"bytes"
	"errors"
	"image"
	"image/draw"
	"image/jpeg"
	_ "image/png" // registers the "png" format with image.Decode

	"github.com/rwcarlsen/goexif/exif"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // registers the "webp" format with image.Decode
)

const (
	// MaxUploadBytes is the largest input this package will decode. Enforced
	// before any decoding happens, so an oversized upload never reaches the
	// image decoders regardless of what it claims to be.
	MaxUploadBytes = 500 * 1024
	// OutputSize is the fixed width/height of every processed avatar,
	// matching the preset avatar convention (apps/web/src/lib/avatarPresets.ts).
	OutputSize        = 128
	outputJPEGQuality = 85
)

var (
	ErrTooLarge          = errors.New("avatar upload exceeds the maximum allowed size")
	ErrUnsupportedFormat = errors.New("avatar upload is not a supported image format (JPEG, PNG, or WebP)")
)

// ProcessAvatarUpload validates, EXIF-orientation-corrects, center-crops,
// and resizes an uploaded image into a fixed OutputSize x OutputSize JPEG.
// The output is always JPEG regardless of the input format.
func ProcessAvatarUpload(data []byte) ([]byte, error) {
	if len(data) > MaxUploadBytes {
		return nil, ErrTooLarge
	}

	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png" && format != "webp") {
		return nil, ErrUnsupportedFormat
	}

	if format == "jpeg" {
		img = applyEXIFOrientation(img, data)
	}

	square := centerCropSquare(img)
	resized := resizeSquare(square, OutputSize)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, resized, &jpeg.Options{Quality: outputJPEGQuality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func centerCropSquare(img image.Image) *image.RGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	side := w
	if h < side {
		side = h
	}
	x0 := b.Min.X + (w-side)/2
	y0 := b.Min.Y + (h-side)/2

	dst := image.NewRGBA(image.Rect(0, 0, side, side))
	draw.Draw(dst, dst.Bounds(), img, image.Point{X: x0, Y: y0}, draw.Src)
	return dst
}

func resizeSquare(src image.Image, size int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	return dst
}

// applyEXIFOrientation rotates/flips img to correct for a JPEG's EXIF
// Orientation tag, if present. Photos taken on phones are frequently stored
// with pixels in landscape plus an orientation tag rather than pre-rotated
// pixels; without this, a center crop would be computed against the wrong
// dimensions and the result would appear sideways.
func applyEXIFOrientation(img image.Image, data []byte) image.Image {
	x, err := exif.Decode(bytes.NewReader(data))
	if err != nil {
		return img
	}
	tag, err := x.Get(exif.Orientation)
	if err != nil {
		return img
	}
	orientation, err := tag.Int(0)
	if err != nil {
		return img
	}
	return orientImage(img, orientation)
}

// orientImage applies the correction for the given EXIF orientation value
// (1-8, per the EXIF/TIFF spec's Orientation tag table).
func orientImage(img image.Image, orientation int) image.Image {
	switch orientation {
	case 2:
		return flipHorizontal(img)
	case 3:
		return rotate180(img)
	case 4:
		return flipVertical(img)
	case 5:
		return flipHorizontal(rotate90CW(img))
	case 6:
		return rotate90CW(img)
	case 7:
		return flipHorizontal(rotate90CCW(img))
	case 8:
		return rotate90CCW(img)
	default:
		return img
	}
}

func rotate90CW(img image.Image) *image.RGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, h, w))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(h-1-y, x, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate90CCW(img image.Image) *image.RGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, h, w))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(y, w-1-x, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate180(img image.Image) *image.RGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(w-1-x, h-1-y, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipHorizontal(img image.Image) *image.RGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(w-1-x, y, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipVertical(img image.Image) *image.RGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.Set(x, h-1-y, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}
