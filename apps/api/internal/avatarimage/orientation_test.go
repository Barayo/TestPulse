package avatarimage

import "testing"

// buildJPEGWithExifOrientation constructs a minimal but structurally valid
// JPEG byte stream carrying a single-entry IFD0 with just the Orientation
// tag, matching the exact layout real cameras/phones produce (and what
// testdata/sample-exif-rotated.jpg contains, byte for byte, for the "MM"
// case). Used to unit-test exifOrientation without depending on a real
// image file for every byte-order/value combination.
func buildJPEGWithExifOrientation(byteOrder string, orientation uint16) []byte {
	be := func(v uint16) []byte { return []byte{byte(v >> 8), byte(v)} }
	le := func(v uint16) []byte { return []byte{byte(v), byte(v >> 8)} }
	be32 := func(v uint32) []byte { return []byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)} }
	le32 := func(v uint32) []byte { return []byte{byte(v), byte(v >> 8), byte(v >> 16), byte(v >> 24)} }

	var u16 func(v uint32) []byte
	var u32 func(v uint32) []byte
	if byteOrder == "MM" {
		u16 = func(v uint32) []byte { return be(uint16(v)) }
		u32 = be32
	} else {
		u16 = func(v uint32) []byte { return le(uint16(v)) }
		u32 = le32
	}

	tiff := []byte{}
	tiff = append(tiff, []byte(byteOrder)...)
	tiff = append(tiff, u16(0x002A)...)
	tiff = append(tiff, u32(8)...) // IFD0 offset
	tiff = append(tiff, u16(1)...) // 1 entry
	tiff = append(tiff, u16(0x0112)...)
	tiff = append(tiff, u16(3)...) // type SHORT
	tiff = append(tiff, u32(1)...) // count 1
	tiff = append(tiff, u16(uint32(orientation))...)
	tiff = append(tiff, 0, 0) // value field padding (4 bytes total)
	tiff = append(tiff, u32(0)...) // next IFD offset

	app1 := append([]byte("Exif\x00\x00"), tiff...)
	segLen := len(app1) + 2
	out := []byte{0xFF, 0xD8, 0xFF, 0xE1, byte(segLen >> 8), byte(segLen)}
	out = append(out, app1...)
	out = append(out, 0xFF, 0xDA, 0x00, 0x02) // start of scan, no more segments
	return out
}

func TestExifOrientation_LittleEndianTIFF(t *testing.T) {
	data := buildJPEGWithExifOrientation("II", 3)
	if got := exifOrientation(data); got != 3 {
		t.Errorf("exifOrientation = %d, want 3", got)
	}
}

func TestExifOrientation_BigEndianTIFF(t *testing.T) {
	data := buildJPEGWithExifOrientation("MM", 6)
	if got := exifOrientation(data); got != 6 {
		t.Errorf("exifOrientation = %d, want 6", got)
	}
}

func TestExifOrientation_NoAPP1Segment(t *testing.T) {
	data := []byte{0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02}
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation = %d, want 0 (no EXIF)", got)
	}
}

func TestExifOrientation_NotAJPEG(t *testing.T) {
	data := []byte("this is not a jpeg at all")
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation = %d, want 0", got)
	}
}

func TestExifOrientation_EmptyAndTinyInput(t *testing.T) {
	for _, data := range [][]byte{nil, {}, {0xFF}, {0xFF, 0xD8}} {
		if got := exifOrientation(data); got != 0 {
			t.Errorf("exifOrientation(%v) = %d, want 0", data, got)
		}
	}
}

func TestExifOrientation_TruncatedAPP1DoesNotPanic(t *testing.T) {
	data := buildJPEGWithExifOrientation("MM", 6)
	// Claim a segment length far larger than the actual remaining bytes.
	data[4], data[5] = 0xFF, 0xFF
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation with over-length segment = %d, want 0", got)
	}
}

func TestExifOrientation_MalformedTIFFByteOrderMarker(t *testing.T) {
	data := buildJPEGWithExifOrientation("MM", 6)
	// Corrupt the "MM"/"II" byte-order marker inside the TIFF header.
	exifIdx := 10 // "Exif\x00\x00" starts right after the APP1 marker+length
	data[exifIdx+6], data[exifIdx+7] = 'Z', 'Z'
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation with corrupt byte-order marker = %d, want 0", got)
	}
}

func TestExifOrientation_IFDOffsetOutOfBoundsDoesNotPanic(t *testing.T) {
	data := buildJPEGWithExifOrientation("MM", 6)
	// The TIFF header's IFD0 offset (4 bytes right after the 2-byte magic
	// number) is at a fixed spot within the "Exif\x00\x00"-prefixed payload.
	tiffStart := 10 + 6 // APP1 header (4) + length (2) + "Exif\x00\x00" (6)
	ifdOffsetPos := tiffStart + 4
	data[ifdOffsetPos], data[ifdOffsetPos+1] = 0xFF, 0xFF
	data[ifdOffsetPos+2], data[ifdOffsetPos+3] = 0xFF, 0xFF
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation with out-of-bounds IFD offset = %d, want 0", got)
	}
}

func TestExifOrientation_OutOfRangeValueIgnored(t *testing.T) {
	data := buildJPEGWithExifOrientation("MM", 9) // valid range is 1-8
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation with out-of-range value 9 = %d, want 0", got)
	}
}

func TestExifOrientation_TruncatedIFDEntryCountDoesNotPanic(t *testing.T) {
	data := buildJPEGWithExifOrientation("MM", 6)
	// Claim far more IFD entries than actually fit in the segment.
	tiffStart := 10 + 6
	ifdCountPos := tiffStart + 8 // magic(2)+offset(4) then IFD0 starts, count is its first 2 bytes
	data[ifdCountPos], data[ifdCountPos+1] = 0xFF, 0xFF
	if got := exifOrientation(data); got != 0 {
		t.Errorf("exifOrientation with truncated IFD entry count = %d, want 0", got)
	}
}
