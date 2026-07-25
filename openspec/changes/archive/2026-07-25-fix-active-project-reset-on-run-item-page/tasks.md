## 1. Fix

- [x] 1.1 Write failing tests in new `useActiveProject.test.tsx` (4
      cases: `/projects/:projectKey` direct match, `/runs/:runKey`
      indirect match, `/runs/:runKey/items/:caseKey` indirect match —
      the one that reproduced the reported bug — and an unrelated route
      returning `undefined`)
- [x] 1.2 Change `useMatch('/runs/:runKey')` to `useMatch('/runs/:runKey/*')`
      in `useActiveProject.ts`
- [x] 1.3 All 4 tests pass; full web suite (499 tests), typecheck, lint
      all clean

## 2. Sync and validate

- [x] 2.1 Run `openspec-sync-specs` for `fix-active-project-reset-on-run-item-page`
- [x] 2.2 `openspec validate fix-active-project-reset-on-run-item-page --strict`
