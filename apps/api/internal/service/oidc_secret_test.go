package service

import "testing"

func TestEncryptDecryptSecretRoundTrips(t *testing.T) {
	ciphertext, err := encryptSecret("a-passphrase-of-any-length", "the-client-secret")
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if string(ciphertext) == "the-client-secret" {
		t.Fatal("ciphertext equals plaintext — not encrypted")
	}

	plaintext, err := decryptSecret("a-passphrase-of-any-length", ciphertext)
	if err != nil {
		t.Fatalf("decryptSecret: %v", err)
	}
	if plaintext != "the-client-secret" {
		t.Errorf("plaintext = %q, want the-client-secret", plaintext)
	}
}

func TestDecryptSecretWrongKeyFails(t *testing.T) {
	ciphertext, err := encryptSecret("key-one", "the-client-secret")
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if _, err := decryptSecret("key-two", ciphertext); err == nil {
		t.Fatal("expected decryption to fail with the wrong key")
	}
}

func TestEncryptSecretProducesDifferentCiphertextEachTime(t *testing.T) {
	a, err := encryptSecret("key", "same-plaintext")
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	b, err := encryptSecret("key", "same-plaintext")
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if string(a) == string(b) {
		t.Error("two encryptions of the same plaintext produced identical ciphertext — nonce is not random")
	}
}
