# Codebase Concerns

## Highest-Risk Areas

### Tracked secrets and runtime state
- `server/.env` is tracked by git. That is a direct secret-management and environment-drift risk because local credentials can leak into history and different developers can unknowingly inherit stale values.
- Multiple SQLite databases and backups are present in the repo tree, including tracked files such as `server/personal-finance.db`, `server/data/app.db.backup_20260417`, and `server/data/app.db.bak`. This increases the chance of using the wrong dataset, committing personal data, and debugging against a database that does not match production assumptions.
- Runtime logs exist under `server/logs/`. I did not confirm whether any log files are tracked, but their presence in the workspace means local operational state is mixed into the source tree.

### Schema repair logic at application startup
- `server/src/core/database.py` performs live SQLite schema mutation during `init_db()` with `_ensure_legacy_installment_schema`, `_ensure_budget_schema`, and `_ensure_frequent_items_schema`.
- This reduces friction for old local databases, but it also makes startup behavior stateful and harder to reason about than migration-only ownership.
- The approach appears SQLite-specific and partial. If schema drift exists outside the explicitly handled columns and indexes, the app may still boot into a half-upgraded state.
- There is no strong signal in the repo that these startup repairs are covered by integration tests against real legacy database files.

### Large cross-module business flows
- Installment handling in `server/src/modules/installments/service.py` is a maintenance hotspot. It spans schedule generation, transaction creation/deletion, account frozen/debt updates, cache invalidation, tag normalization, and snapshot writes.
- That kind of service-layer concentration makes regressions likely when changing adjacent modules such as `transactions`, `accounts`, `reports`, or balance snapshots.
- Similar risk likely exists in other finance-critical service modules, but I only sampled installments directly.

## Architecture and Coupling Concerns

### Tight coupling through service-to-service imports
- Representative backend services call directly into other modules’ service functions rather than isolating changes behind narrower domain contracts.
- Example: installment code imports transaction creation/deletion, account frozen updates, cache clearing, and model lookups directly.
- This pattern is workable in a small codebase, but it usually raises the blast radius of changes and makes unit tests more setup-heavy.

### Startup relies on side effects
- `server/src/main.py` initializes the database in the FastAPI lifespan hook.
- Combined with startup schema repair, application boot is not just “connect and serve”; it can mutate persistent state.
- That is convenient locally, but risky for deployment predictability and for debugging startup-only failures.

### Frontend auth and API behavior are centralized but stateful
- `web/src/services/api.ts` handles token lookup from `localStorage`, redirects on `401/403`, and writes debug state onto `window.__lastError`.
- This is pragmatic, but it couples fetch behavior to browser globals and navigation side effects, which can complicate SSR reuse, isolated component testing, and future auth changes.

## Repository Hygiene Concerns

### Generated, backup, and harness artifacts live beside source
- The repo contains `web/dist-harness/`, `web/playwright-temp/`, `web/test-results/`, `web/tag-style-shots/`, and `web/src/App.tsx.backup`.
- Some of these appear intentionally useful during UI iteration, but they also make it harder to distinguish source of truth from experiment output.
- `web/dist-harness/tag-picker-harness.html` and `web/src/App.tsx.backup` are tracked by git, which confirms at least some temporary or derived artifacts are in version control.

### `.gitignore` patterns are broad and somewhat contradictory
- `.gitignore` ignores `docs/` and `*.md` globally, then re-allows `README.md`. However, this repo still contains many markdown files under `docs/` and `.planning/`, so historical tracking and current ignore rules are not aligned.
- `server/data/*.db` is ignored, but tracked database backups still exist. That means the effective repo hygiene depends on history, not on the current ignore policy alone.
- This mismatch can confuse contributors about what is safe to edit, remove, or expect in a clean clone.

## Testing and Verification Gaps

### Coverage is backend-heavy and selective
- The repo contains backend pytest coverage for reports, tags, budgets, refunds, transfers, bills parsing, account balance trend, and installments.
- I did not find evidence of broad end-to-end coverage across the full API surface, especially for startup migrations, auth flows, imports, or multi-module reconciliation behavior.
- The most failure-prone paths in a finance system are cross-entity invariants; sampled tests mostly validate targeted scenarios rather than full workflow integrity.

### Frontend automated testing appears ad hoc
- The frontend has Playwright configs split across phase-specific files and a temp directory: `web/playwright.phase1.config.cjs`, `phase2`, `phase3`, plus specs under `web/playwright-temp/`.
- Those configs assume a local Chrome binary at `/usr/bin/google-chrome`, which is an environment-specific dependency and a portability risk.
- I only found one conventional source-level frontend unit test file: `web/src/utils/__tests__/importDraftStorage.test.ts`.
- That suggests routine UI regressions may depend on manual harnesses and local exploratory testing more than stable CI-grade automation.

### Legacy database compatibility is probably under-tested
- Because the application includes explicit compatibility shims for older SQLite schemas, confidence should come from fixture databases representing those legacy states.
- I did not inspect such fixture databases or tests that assert upgrade behavior on startup, so this is a likely blind spot rather than a confirmed absence.

## Data and Domain Risk

### Financial correctness is distributed across many flags and derived fields
- The domain uses multiple bookkeeping flags such as expense/income/cashflow inclusion, debt/frozen/current balance fields, schedule status, and business keys.
- That is normal for a finance product, but it raises the cost of proving invariants after refactors.
- Small mistakes can remain silent until aggregate reports or repayment flows disagree.

### Local business-date handling can drift from persisted timestamps
- README and common utilities indicate a “local business date” concept intended to avoid timezone issues.
- At the same time, representative code uses both `datetime.utcnow()` and date-based logic.
- Without stronger end-to-end tests around timezone and date-boundary behavior, month-end and repayment-day bugs remain plausible.

## Operational Concerns

### Environment-specific CORS configuration is manually accumulated
- `server/src/core/config.py` contains a long hard-coded allowlist of localhost, localtunnel, and cpolar origins with dated comments.
- This is a maintenance burden and a sign that environment setup is handled reactively.
- It also raises the chance of stale or overly permissive origins remaining in the config longer than intended.

### Local-first assumptions are embedded in the stack
- The default database is SQLite, tests use in-memory SQLite, and some frontend/browser tooling assumes local installed binaries.
- That keeps setup simple, but it can hide issues that only appear under production-like concurrency, filesystem, or deployment conditions.

## Things To Revisit Soon

1. Remove secrets and personal/runtime data from version control, then rotate any exposed credentials.
2. Decide whether startup schema repair is temporary migration debt or an intentional long-term compatibility layer.
3. Separate durable source files from harness output, build artifacts, backups, and one-off UI experiment files.
4. Add verification for legacy database upgrade paths and for finance-critical end-to-end invariants.
5. Normalize environment configuration so tunnels, browser paths, and local debug setup are not hard-coded into primary app config.

## Uncertainty Notes

- I confirmed the presence of risky files in the workspace and verified several are tracked by git, but I did not inspect repository history to determine why they were committed.
- I sampled representative modules rather than reading every service file, so coupling concerns are evidence-based but not exhaustive.
- I did not run the test suite, so statements about coverage are based on discovered test files and configs, not on observed pass/fail behavior.
