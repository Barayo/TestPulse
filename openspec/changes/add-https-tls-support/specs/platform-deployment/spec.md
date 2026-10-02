## ADDED Requirements

### Requirement: Optional native TLS termination
The API SHALL optionally terminate TLS directly when both `TESTPULSE_TLS_CERT_FILE` and `TESTPULSE_TLS_KEY_FILE` are configured, serving plain HTTP (the existing default behavior) when neither is set. The system SHALL fail fast at startup, naming the missing variable, if exactly one of the pair is set.

#### Scenario: Both cert and key configured
- **WHEN** the API starts with both `TESTPULSE_TLS_CERT_FILE` and `TESTPULSE_TLS_KEY_FILE` set to valid file paths
- **THEN** the server terminates TLS directly, serving HTTPS on the configured address

#### Scenario: Neither configured
- **WHEN** the API starts with neither `TESTPULSE_TLS_CERT_FILE` nor `TESTPULSE_TLS_KEY_FILE` set
- **THEN** the server serves plain HTTP, unchanged from current behavior

#### Scenario: Only one of the pair configured
- **WHEN** the API starts with only `TESTPULSE_TLS_CERT_FILE` or only `TESTPULSE_TLS_KEY_FILE` set
- **THEN** startup fails immediately with an error naming the missing variable, and the server does not start on plain HTTP as a fallback

### Requirement: Documented reverse-proxy TLS termination path
The project SHALL document at least one concrete, runnable reverse-proxy configuration (Caddy) that terminates TLS in front of the existing docker-compose stack and forwards `X-Forwarded-Proto: https`, alongside documented nginx and Traefik configuration snippets for the same purpose.

#### Scenario: Caddy-fronted compose stack
- **WHEN** an operator runs the documented Caddy-fronted compose override alongside the base compose stack
- **THEN** the application is reachable over HTTPS, and requests reaching the API carry `X-Forwarded-Proto: https`, so the session cookie is marked `Secure`
