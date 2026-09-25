## ADDED Requirements

### Requirement: The running instance serves interactive API documentation
A TestPulse instance SHALL serve interactive, rendered API documentation
at `GET /docs`, generated from the exact `openapi.yaml` contract embedded
in that binary, reachable without authentication and without any external
network dependency.

#### Scenario: The docs endpoint renders without authentication
- **WHEN** an unauthenticated request is made to `GET /docs`
- **THEN** the response renders the interactive API documentation UI, not
  a 401 or redirect to login

#### Scenario: The rendered docs reflect the embedded contract
- **WHEN** the docs UI loads its spec
- **THEN** it fetches the spec from a same-origin endpoint serving the
  binary's own embedded `openapi.yaml`, not an external URL

#### Scenario: No request leaves the deployment to render the docs
- **WHEN** the docs UI is loaded and rendered
- **THEN** every script, stylesheet, and spec-validation feature is
  served same-origin, with no call to an external validation or asset
  host

### Requirement: The API contract declares a bearer token security scheme
`openapi.yaml` SHALL declare an HTTP bearer security scheme, so that
tooling generated from the contract (including the live docs UI's
"Authorize" flow) can authenticate requests using a scoped API token.

#### Scenario: The docs UI offers a bearer token Authorize flow
- **WHEN** a user opens the docs UI's Authorize dialog
- **THEN** it accepts a bearer token and attaches it to subsequent
  "Try it out" requests as an `Authorization: Bearer <token>` header
