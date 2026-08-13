// Package mailer sends transactional email (add-forgot-password). It is the
// first email-sending capability in this codebase — stdlib net/smtp only,
// no third-party dependency.
package mailer

import (
	"context"
	"fmt"
	"net/smtp"
)

// Sender abstracts email delivery so the service layer never imports
// net/smtp directly, and tests can substitute a fake with no network I/O.
type Sender interface {
	Send(ctx context.Context, to, subject, body string) error
}

// BuildMessage renders a minimal RFC 5322 plain-text message. Extracted as
// a pure function so message formatting is testable without a real SMTP
// connection.
func BuildMessage(to, from, subject, body string) []byte {
	return fmt.Appendf(nil, "To: %s\r\nFrom: %s\r\nSubject: %s\r\n\r\n%s\r\n", to, from, subject, body)
}

// SMTPSender sends mail via net/smtp.SendMail. Username/password may be
// left blank for an unauthenticated relay (e.g. Mailpit in the compose
// stack) — Auth is nil in that case rather than an empty PlainAuth.
type SMTPSender struct {
	Host, Port         string
	Username, Password string
	From               string
}

func (s *SMTPSender) Send(_ context.Context, to, subject, body string) error {
	addr := s.Host + ":" + s.Port
	var auth smtp.Auth
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	return smtp.SendMail(addr, auth, s.From, []string{to}, BuildMessage(to, s.From, subject, body))
}
