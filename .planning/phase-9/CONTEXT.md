# Phase 9 Context: Account Reconciliation

## Status

Planned on 2026-04-30 in auto mode. Recommended defaults below are treated as the current source of truth unless a later discussion overrides them.

## Scope

Phase 9 introduces statement-based account reconciliation with discrepancy identification and an explicit close-the-period workflow.

## Planning Default

Because this phase was planned with `--auto`, open implementation choices are resolved using conservative defaults that favor auditability and reuse of existing import and balance-adjustment flows.

## Current State Notes

- Account detail already supports month-scoped transaction review, balance trend display, and explicit balance adjustments.
- Credit accounts already carry billing-day and repayment-day metadata plus current statement calculations in `server/src/modules/accounts/service.py`.
- The app already has staged bill import behavior with parsed rows, matching hints, duplicate signals, and review UI in `web/src/components/StagingImportTable.tsx`.
- Import evidence currently supports "review then confirm into transactions"; reconciliation should reuse these parsing and staging patterns without collapsing reconciliation into ordinary import confirmation.
- Account balance snapshots already exist and can support period-closing comparisons or adjustment audit support.

## Locked Answers

- `RECON-01`: Each reconciliation session is for one account and one statement period only.
- `RECON-02`: Users start reconciliation from the account detail workflow.
- `RECON-03`: The review surface must classify rows and transactions into matched, missing, extra, duplicate, and unresolved buckets.
- `RECON-04`: Credit accounts default to bill-cycle periods derived from account billing metadata when available.
- `RECON-05`: Non-credit accounts support manual statement-period reconciliation using a user-supplied statement end date and balance anchor.
- `RECON-06`: Reconciliation does not auto-adjust balances; closing differences requires an explicit adjustment action.
- `RECON-07`: Final persisted statuses distinguish `balanced`, `adjusted`, and `discrepant`.

## Recommended Defaults

- `RECON-D1`: Add a dedicated `reconciliations` backend module with persistent session, imported evidence summary, and review result fields.
- `RECON-D2`: A reconciliation session stores:
  - account id
  - statement period start and end
  - statement closing balance
  - optional statement opening balance
  - imported evidence metadata
  - calculated ledger closing balance
  - difference amount
  - session status
- `RECON-D3`: Matching priority is:
  1. exact external reference or order number match
  2. exact amount plus same-day match
  3. exact amount plus small date-window candidate match flagged for review
  4. unresolved/manual
- `RECON-D4`: Statement evidence should reuse existing bill parsers and import-row style normalization where possible instead of adding a second parsing stack.
- `RECON-D5`: The reconciliation workspace should support statement evidence plus ledger-only reconciliation. File import is recommended but not mandatory for a session.
- `RECON-D6`: For credit accounts, the default statement period should align with existing billing-day calculations rather than a freeform calendar month.
- `RECON-D7`: When the user chooses to close a non-zero difference, the UI should call the existing balance-adjust endpoint with a reconciliation-specific reason instead of writing balances directly.
- `RECON-D8`: Reconciliation history should remain visible from account detail so users can review prior statement closes.

## Likely Implementation Surface

Frontend:

- `web/src/App.tsx`
- `web/src/components/StagingImportTable.tsx`
- `web/src/services/api.ts`

Backend:

- `server/src/main.py`
- `server/src/modules/accounts/router.py`
- `server/src/modules/accounts/service.py`
- `server/src/modules/bills/service.py`
- `server/src/modules/bills/schemas.py`
- `server/src/modules/imports/models.py`
- `server/src/modules/reconciliations/*`
- `server/src/modules/transactions/router.py`
- `server/src/modules/transactions/service.py`
- `server/migrations/versions/*`

## Clarifications By Requirement

- `RECON-01` means a session cannot span multiple accounts even if the statement file contains more than one account.
- `RECON-02` means users should not need to leave account detail to begin or complete reconciliation.
- `RECON-03` requires explainable status buckets, not just a single "difference exists" banner.
- `RECON-04` means credit-card reconciliation should respect current billing semantics already used for statement balances.
- `RECON-05` means debit/cash accounts can reconcile even without billing-day fields by using manual statement-period anchors.
- `RECON-06` means completing a reconciliation does not bypass the ledger or mutate account balances behind the user's back.
- `RECON-07` means reporting and history must show whether a close was naturally balanced, settled by adjustment, or left discrepant.

## Audit Focus

Treat any of the following as a Phase 9 mismatch:

- reconciliation implemented as a hidden side effect of ordinary import confirmation
- no durable session record for a completed or in-progress reconciliation
- no way to explain which rows are unmatched, extra, or duplicate
- credit-account reconciliation ignoring the account's existing billing-day logic
- completion flow that mutates balances without an explicit adjustment transaction
- no reconciliation history visible from the account-level workflow
