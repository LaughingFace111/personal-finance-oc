# Phase 9 Project: Account Reconciliation

## What This Phase Is

Phase 9 adds an account reconciliation workflow that lets users compare an account's ledger against a statement period, identify gaps, and close the period with an auditable reconciliation result.

## Core Value

Users should be able to trust that an account's ledger matches the external statement they are checking, and when it does not match, the app should make the source of the difference obvious.

## In Scope

- Add a dedicated reconciliation domain for one account plus one statement period at a time
- Support statement-based reconciliation for both credit-style accounts and cash/debit-style accounts
- Reuse the existing bill import and staging patterns when a statement file is available
- Compare imported statement rows and current ledger transactions to classify matched, missing, extra, duplicate, and unresolved items
- Capture statement opening or closing anchors needed to compute a reconciliation difference
- Show reconciliation progress, summary counts, and remaining discrepancy amount before completion
- Allow explicit completion of a balanced reconciliation and explicit carry-forward of an unresolved reconciliation
- Allow the user to create a reconciliation adjustment through the existing balance-adjustment path when they choose to settle a remaining difference manually
- Keep a durable audit trail of each reconciliation session, its imported evidence, and its final outcome

## Out of Scope

- Full bank-feed integrations or background sync with external institutions
- OCR-heavy statement extraction for arbitrary PDFs in this phase
- Fully automatic matching that completes reconciliation without user review
- Cross-account or whole-book reconciliation in one workflow
- Auto-generated repayments, auto-generated transfers, or rule-based auto-fixes for discrepancies
- Replacing the existing transaction import workflow for non-reconciliation use cases

## Locked Decisions

- `RECON-01`: Reconciliation is modeled as an explicit session tied to exactly one account and one statement period.
- `RECON-02`: The primary entry point lives from the account detail experience rather than a disconnected admin page.
- `RECON-03`: Imported statement rows and existing ledger transactions are compared in a review workspace that shows matched, missing, extra, duplicate, and unresolved states.
- `RECON-04`: Credit accounts default to statement-cycle reconciliation using the account's billing metadata when it exists.
- `RECON-05`: Non-credit accounts can still reconcile by a user-chosen statement end date and balance anchor even if they do not have billing-day metadata.
- `RECON-06`: Finishing a reconciliation never silently changes balances; any balance-closing adjustment is an explicit user action that reuses the app's adjustment transaction flow.
- `RECON-07`: The final session status is persisted as balanced, adjusted, or discrepant so users can distinguish a clean close from a forced close.

## Recommended Technical Direction

- Add a dedicated backend reconciliation module rather than overloading `imports` or `accounts` tables with session state.
- Reuse existing bill parsers, staging concepts, and duplicate-detection signals where possible instead of building a second import pipeline.
- Treat imported statement rows as evidence for matching, not as automatically confirmed ledger transactions.
- Keep the matching engine deterministic and explainable: prefer exact external reference matches first, then strict amount plus date heuristics, then user confirmation.
- Use the existing `/api/transactions/adjust` behavior for reconciliation write-offs so accounting impact stays consistent with current balance-adjustment semantics.
- Surface reconciliation summaries on the account detail page first; add broader dashboards later if needed.

## Likely Implementation Surface

- `server/src/main.py`
- `server/src/modules/accounts/*`
- `server/src/modules/bills/*`
- `server/src/modules/imports/models.py`
- `server/src/modules/reconciliations/*`
- `server/src/modules/transactions/*`
- `server/migrations/versions/*`
- `web/src/App.tsx`
- `web/src/components/StagingImportTable.tsx`
- `web/src/services/api.ts`

## Success Criteria

1. Users can start a reconciliation session for an account and statement period from account detail.
2. Users can load statement evidence, see a categorized comparison against ledger transactions, and understand why the session is not balanced.
3. Credit-card reconciliation defaults align with billing-cycle semantics already used elsewhere in the app.
4. Users can explicitly finish a balanced reconciliation or explicitly settle a remaining difference with an adjustment transaction.
5. Reconciliation history remains auditable and does not silently mutate ledger balances or imported evidence.
