## 1. Contract first

- [ ] 1.1 Add `platform` (string, optional), `testType` (string, optional), `automated` (boolean, default false) to the case create/update schemas in `packages/shared/openapi.yaml`
- [ ] 1.2 `make generate`, confirm no drift

## 2. Domain + store (TDD)

- [ ] 2.1 Write failing store/domain tests: all three fields persist through case create and update; `automated` defaults to false when omitted
- [ ] 2.2 Add `Platform`, `TestType`, `Automated` to `domain.CaseContent`, thread through store create/update queries and the existing cases migration (amend in place, pre-1.0 policy)
- [ ] 2.3 Confirm green

## 3. Verification

- [ ] 3.1 `make lint`, `make test`, `make coverage-api` all green
- [ ] 3.2 Confirm `openspec validate add-case-classification-fields` passes

## 4. Docs

- [ ] 4.1 Update `docs/test-management.md`'s case-creation section to mention the three fields
