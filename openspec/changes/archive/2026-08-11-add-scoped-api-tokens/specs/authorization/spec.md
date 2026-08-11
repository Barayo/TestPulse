## MODIFIED Requirements

### Requirement: Agent actors inherit their creator's permission level
An API token's actor SHALL never have its own project membership. Its
Tenant Admin flag and effective permissions on any project SHALL be
resolved from its creator's current state at request time, not the
creator's state at token-creation time.

A token created scoped to a project and a role (per the authentication
capability) SHALL instead be authorized for the intersection of that
role's current permission flags and its creator's current effective
permissions on that one project — never more than either alone would
allow — and SHALL be rejected outright for any request against a
different project, regardless of what its creator can access there. If
the role a scoped token depends on is deleted, the token itself SHALL stop
authenticating entirely (fail closed), never fall back to unscoped/full
access.

#### Scenario: Token acts at creator's current effective permissions
- **WHEN** an API token created by a user whose effective role on a project
  grants `caseEdit` is used to edit a case in that project
- **THEN** the request succeeds exactly as it would for the creator

#### Scenario: Token reflects a change to the creator's role made after token creation
- **WHEN** a token's creator's project role assignment is later changed to
  one that no longer grants `manageProject`
- **THEN** subsequent requests using that token are no longer authorized to
  perform `manageProject` actions on that project

#### Scenario: Scoped token is authorized only for its role's granted flags
- **WHEN** a token scoped to a project via a role granting only `read` and
  `caseEdit` is used to attempt an action requiring `caseDelete`, even
  though its creator currently holds `caseDelete` on that project
- **THEN** the request is rejected with `403`

#### Scenario: Scoped token narrows further if the creator's own access narrows
- **WHEN** a token is scoped to a project via a role granting `caseEdit`,
  and the creator's own effective role on that project is later changed to
  no longer include `caseEdit`
- **THEN** subsequent requests using that token are no longer authorized to
  perform `caseEdit` actions, even though the token's own scoped role
  still grants it

#### Scenario: Scoped token cannot act outside its granted project
- **WHEN** a token scoped to Project A is used on a request against
  Project B, even one the token's creator has full access to
- **THEN** the request is rejected with `403`

#### Scenario: Deleting a scoped token's role deletes the token
- **WHEN** a Tenant Admin deletes a role that a token is currently scoped
  to
- **THEN** the token is deleted along with the role and stops
  authenticating entirely — it does not fall back to unscoped/full access
