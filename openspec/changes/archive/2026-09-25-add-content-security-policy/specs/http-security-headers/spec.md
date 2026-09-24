## ADDED Requirements

### Requirement: Every HTTP response carries a Content-Security-Policy header
Every HTTP response SHALL include a `Content-Security-Policy` header
restricting script execution to same-origin sources only, with no
`'unsafe-inline'` or `'unsafe-eval'` in `script-src`.

#### Scenario: A response includes a restrictive script-src
- **WHEN** any HTTP response is returned
- **THEN** its `Content-Security-Policy` header includes `script-src 'self'`

#### Scenario: The policy allows the styles the bundle actually needs
- **WHEN** any HTTP response is returned
- **THEN** its `Content-Security-Policy` header includes
  `style-src 'self' 'unsafe-inline'`, permitting the embedded bundle's
  inline `style` attributes to render

#### Scenario: The policy allows same-origin images and the one data URI the bundle uses
- **WHEN** any HTTP response is returned
- **THEN** its `Content-Security-Policy` header includes
  `img-src 'self' data:`

#### Scenario: The policy restricts framing
- **WHEN** any HTTP response is returned
- **THEN** its `Content-Security-Policy` header includes
  `frame-ancestors 'none'`, alongside the existing `X-Frame-Options: DENY`
