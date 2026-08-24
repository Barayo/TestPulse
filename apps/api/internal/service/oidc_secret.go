package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
)

// encryptSecret encrypts plaintext (the OIDC client secret) with
// AES-256-GCM, keyed by sha256(key) — normalizing any passphrase length to
// the 32 bytes AES-256 requires (add-sso-oidc design.md D7). The random
// nonce is prepended to the returned ciphertext, so decryptSecret needs
// only the same key to reverse it.
func encryptSecret(key, plaintext string) ([]byte, error) {
	block, err := newAESCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, []byte(plaintext), nil), nil
}

// decryptSecret reverses encryptSecret. A wrong key (or corrupted
// ciphertext) fails the GCM authentication tag check rather than silently
// returning garbage.
func decryptSecret(key string, ciphertext []byte) (string, error) {
	block, err := newAESCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, sealed := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func newAESCipher(key string) (cipher.Block, error) {
	sum := sha256.Sum256([]byte(key))
	return aes.NewCipher(sum[:])
}
