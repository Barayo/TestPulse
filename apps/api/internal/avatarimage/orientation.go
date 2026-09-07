package avatarimage

import "encoding/binary"

// exifOrientation extracts the EXIF Orientation tag (1-8) from raw JPEG
// bytes, or 0 if absent or unparseable. JPEG markers are scanned directly
// (SOI, then a segment stream of 0xFF-prefixed markers each carrying a
// 2-byte length) until the first APP1 segment carrying an "Exif\x00\x00"
// header is found, or the compressed scan data begins (SOS marker) —
// nothing past that point is metadata.
//
// This reads only the single tag ProcessAvatarUpload needs rather than
// depending on a general-purpose EXIF library against untrusted upload
// bytes (#178: github.com/rwcarlsen/goexif is unmaintained since 2019,
// with no patch path for a memory-safety or hang-class bug).
func exifOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 0
	}
	pos := 2
	for pos+4 <= len(data) {
		if data[pos] != 0xFF {
			return 0
		}
		marker := data[pos+1]
		if marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) {
			pos += 2
			continue
		}
		if marker == 0xD9 || marker == 0xDA {
			return 0 // EOI or start-of-scan: no metadata segments remain
		}
		segLen := int(binary.BigEndian.Uint16(data[pos+2 : pos+4]))
		if segLen < 2 || pos+2+segLen > len(data) {
			return 0
		}
		segStart, segEnd := pos+4, pos+2+segLen
		if marker == 0xE1 && segEnd-segStart >= 6 && string(data[segStart:segStart+6]) == "Exif\x00\x00" {
			if o := parseExifOrientation(data[segStart+6 : segEnd]); o != 0 {
				return o
			}
		}
		pos = segEnd
	}
	return 0
}

// parseExifOrientation reads IFD0's Orientation tag (0x0112, type SHORT)
// from a TIFF structure — the payload of an Exif APP1 segment, after its
// "Exif\x00\x00" prefix. Returns 0 if malformed, the tag is absent, or its
// value falls outside the EXIF spec's defined range (1-8).
func parseExifOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 0
	}
	var bo binary.ByteOrder
	switch string(tiff[0:2]) {
	case "II":
		bo = binary.LittleEndian
	case "MM":
		bo = binary.BigEndian
	default:
		return 0
	}
	if bo.Uint16(tiff[2:4]) != 0x002A {
		return 0
	}
	ifdOffset := int(bo.Uint32(tiff[4:8]))
	if ifdOffset < 0 || ifdOffset+2 > len(tiff) {
		return 0
	}
	count := int(bo.Uint16(tiff[ifdOffset : ifdOffset+2]))
	entriesStart := ifdOffset + 2
	for i := 0; i < count; i++ {
		entryStart := entriesStart + i*12
		if entryStart+12 > len(tiff) {
			return 0
		}
		if bo.Uint16(tiff[entryStart:entryStart+2]) != 0x0112 {
			continue
		}
		if bo.Uint16(tiff[entryStart+2:entryStart+4]) != 3 { // type SHORT
			return 0
		}
		value := int(bo.Uint16(tiff[entryStart+8 : entryStart+10]))
		if value < 1 || value > 8 {
			return 0
		}
		return value
	}
	return 0
}
