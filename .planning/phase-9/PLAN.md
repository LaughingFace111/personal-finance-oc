---
phase: 09-account-reconciliation
plan: 01
type: execute
wave: 1
depends_on:
  - .planning/phase-8/SUMMARY.md
files_modified:
  - .planning/phase-9/CONTEXT.md
  - .planning/phase-9/PROJECT.md
  - server/src/main.py
  - server/src/modules/accounts/router.py
  - server/src/modules/accounts/service.py
  - server/src/modules/bills/schemas.py
  - server/src/modules/bills/service.py
  - server/src/modules/imports/models.py
  - server/src/modules/reconciliations/__init__.py
  - server/src/modules/reconciliations/models.py
  - server/src/modules/reconciliations/router.py
  - server/src/modules/reconciliations/schemas.py
  - server/src/modules/reconciliations/service.py
  - server/src/modules/transactions/router.py
  - server/src/modules/transactions/service.py
  - server/migrations/versions/*
  - web/src/App.tsx
  - web/src/components/StagingImportTable.tsx
  - web/src/services/api.ts
autonomous: true
requirements: [RECON-01, RECON-02, RECON-03, RECON-04, RECON-05, RECON-06, RECON-07]
user_setup: []
must_haves:
  truths:
    - Reconciliation is an explicit per-account, per-statement-period workflow with durable session state.
    - Credit-account reconciliation must reuse existing billing-cycle semantics rather than inventing a parallel period model.
    - Imported statement evidence supports matching and review but does not silently become confirmed ledger data.
    - Closing a non-zero difference requires an explicit adjustment transaction rather than direct balance mutation.
    - Users must be able to tell whether a session ended balanced, adjusted, or still discrepant.
  artifacts:
    - Backend APIs exist to create, review, update, and complete reconciliation sessions.
    - Matching output exposes categorized counts and row-level statuses for statement rows and ledger candidates.
    - Account detail exposes reconciliation entry, in-progress review, history, and explicit close actions.
    - Reconciliation close can optionally launch the existing balance-adjustment flow with reconciliation context.
  key_links:
    - `server/src/modules/accounts/service.py` already contains billing-cycle and statement-balance logic that credit-account reconciliation should reuse.
    - `server/src/modules/bills/service.py`, `server/src/modules/bills/schemas.py`, and `server/src/modules/imports/models.py` already represent the current statement-import and staging evidence path.
    - `server/src/modules/transactions/service.py` already contains the canonical balance-adjustment behavior that reconciliation write-offs should reuse instead of bypassing.
    - `web/src/App.tsx` already owns account detail and is the natural place to anchor the first reconciliation entry point.
    - `web/src/components/StagingImportTable.tsx` already contains staged-import review patterns that can inform reconciliation row review UX.
---

<objective>
Deliver Phase 9 by adding an auditable account-reconciliation workflow that compares statement evidence against ledger transactions, highlights discrepancies, and supports explicit period close.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Add the backend reconciliation domain, session persistence, and summary APIs</name>
  <files>.planning/phase-9/CONTEXT.md, server/src/main.py, server/src/modules/imports/models.py, server/src/modules/reconciliations/__init__.py, server/src/modules/reconciliations/models.py, server/src/modules/reconciliations/router.py, server/src/modules/reconciliations/schemas.py, server/src/modules/reconciliations/service.py, server/migrations/versions/*</files>
  <read_first>.planning/phase-9/PROJECT.md, .planning/phase-9/CONTEXT.md, server/src/modules/accounts/service.py, server/src/modules/imports/models.py, server/src/modules/transactions/service.py</read_first>
  <action>Create a dedicated reconciliation module with persisted session records for one account plus one statement period, including period dates, statement opening or closing anchors, ledger closing totals, difference amount, evidence metadata, and final status fields for `balanced`, `adjusted`, and `discrepant`. Register the module in `server/src/main.py`, add migrations, and expose API routes to create a session, fetch session detail, list account reconciliation history, and update session review state without overloading the existing import-batch tables as the session source of truth.</action>
  <verify>Inspect the new models, schemas, router registration, and migration files to confirm reconciliation sessions are first-class records with durable audit data and account-scoped history endpoints.</verify>
  <acceptance_criteria>
    - `RECON-01` and `RECON-07` are enforced by persisted reconciliation session structure.
    - `server/src/main.py` registers reconciliation routes.
    - Migration files create reconciliation persistence without replacing the current import tables.
  </acceptance_criteria>
  <done>The backend has a durable reconciliation session domain with APIs the frontend can build on.</done>
</task>

<task type="auto">
  <name>Task 2: Build statement-evidence ingestion and deterministic matching against existing ledger transactions</name>
  <files>server/src/modules/accounts/service.py, server/src/modules/bills/schemas.py, server/src/modules/bills/service.py, server/src/modules/reconciliations/schemas.py, server/src/modules/reconciliations/service.py, server/src/modules/transactions/service.py</files>
  <read_first>.planning/phase-9/CONTEXT.md, server/src/modules/accounts/service.py, server/src/modules/bills/service.py, server/src/modules/bills/schemas.py, server/src/modules/transactions/service.py</read_first>
  <action>Reuse the existing bill-parse and staged-import normalization patterns so a reconciliation session can attach statement evidence and compare it to ledger transactions for the same account and statement period. Implement deterministic matching that prefers exact external references such as order number when available, then exact amount plus same-day matches, then narrow date-window candidates flagged for review, and finally unresolved rows. Return categorized results for matched, missing, extra, duplicate, and unresolved items together with ledger-versus-statement totals and the remaining difference amount. For credit accounts, derive the default statement period from the existing billing-cycle helpers in `server/src/modules/accounts/service.py` instead of introducing a second cycle algorithm.</action>
  <verify>Inspect the reconciliation service response shape and matching code to confirm statement rows remain evidence, matching is explainable, and credit-account periods reuse current billing semantics.</verify>
  <acceptance_criteria>
    - `RECON-03` and `RECON-04` are satisfied by the comparison contract.
    - Matching output includes categorized row or transaction statuses rather than a single aggregate difference.
    - Statement evidence does not auto-confirm itself into the ledger during reconciliation review.
  </acceptance_criteria>
  <done>Reconciliation sessions can ingest statement evidence and produce a deterministic discrepancy review model.</done>
</task>

<task type="auto">
  <name>Task 3: Add an account-detail reconciliation workspace with progress, review buckets, and history</name>
  <files>web/src/App.tsx, web/src/components/StagingImportTable.tsx, web/src/services/api.ts</files>
  <read_first>.planning/phase-9/CONTEXT.md, web/src/App.tsx, web/src/components/StagingImportTable.tsx, web/src/services/api.ts</read_first>
  <action>Extend the account detail flow to expose a reconciliation entry point, session list or history, and an in-page or modal workspace for one active reconciliation. Reuse the existing staged-review interaction patterns where helpful, but present reconciliation-specific buckets for matched, missing, extra, duplicate, and unresolved items together with statement totals, ledger totals, and remaining difference. Default credit accounts into their current statement-cycle period and allow manual statement-period anchors for non-credit accounts without forcing billing metadata. Keep the reconciliation workspace attached to the account detail experience rather than sending users to a disconnected screen.</action>
  <verify>Inspect account-detail UI state, API integration, and review rendering to confirm users can start reconciliation from account detail, inspect discrepancies, and revisit past sessions.</verify>
  <acceptance_criteria>
    - `RECON-02`, `RECON-03`, and `RECON-05` are satisfied in the UI flow.
    - Account detail exposes both a way to start reconciliation and a way to see prior reconciliation sessions.
    - The review workspace shows categorized discrepancy buckets plus statement and ledger summary values.
  </acceptance_criteria>
  <done>Users can run and review reconciliations directly from the account-level workflow.</done>
</task>

<task type="auto">
  <name>Task 4: Add explicit reconciliation close actions, optional adjustment settlement, and end-to-end safeguards</name>
  <files>server/src/modules/reconciliations/router.py, server/src/modules/reconciliations/schemas.py, server/src/modules/reconciliations/service.py, server/src/modules/transactions/router.py, server/src/modules/transactions/service.py, web/src/App.tsx, web/src/services/api.ts</files>
  <read_first>.planning/phase-9/CONTEXT.md, server/src/modules/reconciliations/service.py, server/src/modules/transactions/router.py, server/src/modules/transactions/service.py, web/src/App.tsx</read_first>
  <action>Add explicit completion actions so a user can mark a session as balanced when the difference is zero, close it as discrepant when they want an auditable unresolved result, or settle it with an explicit reconciliation adjustment that calls the existing balance-adjustment behavior with a reconciliation-specific reason. Persist close metadata, prevent accidental silent balance mutation, and refresh account detail or reconciliation summaries after completion so the user can see whether the session ended balanced, adjusted, or discrepant.</action>
  <verify>Inspect close-action routes, adjustment reuse, and frontend completion flow to confirm reconciliation close never mutates balances invisibly and always records the final outcome.</verify>
  <acceptance_criteria>
    - `RECON-06` and `RECON-07` are satisfied by the close flow.
    - Closing a non-zero difference uses the existing adjustment transaction path rather than direct balance writes.
    - Completed sessions clearly show whether they were balanced, adjusted, or discrepant.
  </acceptance_criteria>
  <done>The reconciliation workflow can be closed safely with an auditable final outcome.</done>
</task>

</tasks>

<verification>
- [ ] Run a backend validation command that covers application import and migration integrity as far as the local environment allows.
- [ ] Run `cd web && npm run build`.
- [ ] Run `cd web && npm exec tsc -- --noEmit` and note any pre-existing failures separately.
- [ ] Confirm account detail exposes a reconciliation entry point and reconciliation history.
- [ ] Confirm a reconciliation session is always tied to one account and one statement period.
- [ ] Confirm review output includes matched, missing, extra, duplicate, and unresolved buckets.
- [ ] Confirm credit-account defaults use billing-cycle semantics rather than a generic calendar month.
- [ ] Confirm non-credit accounts can still reconcile with manual statement-period anchors.
- [ ] Confirm closing a non-zero difference requires an explicit adjustment or explicit discrepant close, not a silent balance mutation.
- [ ] Confirm completed sessions display `balanced`, `adjusted`, or `discrepant` status.
</verification>

<output>
After completion, create `.planning/phase-9/SUMMARY.md`
</output>
