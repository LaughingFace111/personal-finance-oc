# Testing

## Overview

The repository contains real automated tests, but the setup is uneven across backend and frontend:

- Backend testing is clearly based on `pytest` with in-memory SQLite fixtures.
- Frontend has one unit-style test file using `import.meta.vitest`, but no obvious Vitest dependency or `test` script is declared in `web/package.json`.
- Frontend interaction testing exists through several Playwright configs and `.cjs` specs in `web/playwright-temp/`.

Because of that, backend testing is high-confidence and repeatable from the checked files. Frontend testing exists, but the exact supported execution path is less standardized.

## Backend Test Setup

### Framework

- `pytest` is used across `server/tests/`.
- Tests import application modules directly from `src...`.
- Most fixtures create a new `sqlite:///:memory:` engine, call `Base.metadata.create_all(engine)`, and yield a `Session`.

### Common Pattern

Typical backend test structure:

1. Create a fresh in-memory database.
2. Seed minimal domain objects such as `Book`, `Account`, `Category`, or `Tag`.
3. Call service-layer functions directly.
4. Assert business outcomes, derived amounts, statuses, and exceptions.

This indicates most backend tests are service-level tests rather than full API integration tests.

### Coverage Areas Observed

Observed test files under `server/tests/`:

- `test_account_balance_trend.py`
- `test_bills_parse.py`
- `test_budgets.py`
- `test_installments.py`
- `test_reports.py`
- `test_transactions_refund.py`
- `test_transfer.py`

Coverage themes from sampled files and filenames:

- installment plan creation and execution flows
- budget overlap validation and reporting calculations
- transfer behavior
- refund behavior
- report calculations
- bill parsing behavior
- account balance trend behavior

### Test Style

- Tests use `pytest.fixture` heavily for seeded books/accounts/sessions.
- Assertions target domain invariants directly, especially around money and status transitions.
- Exception behavior is validated with `pytest.raises(...)`.
- Monetary assertions use `Decimal`, matching production modeling.

### Backend Gaps

- The sampled tests exercise services directly more often than HTTP endpoints, so router/dependency behavior may have thinner coverage.
- No centralized `conftest.py` was inspected in the repo root of `server/tests/`, suggesting fixtures may be repeated per file.
- Migration and startup behavior appear only partially covered. `test_account_balance_trend.py` references `pytest.importorskip("alembic")`, which suggests some optional migration-related validation rather than a comprehensive migration suite.

## Frontend Test Setup

## Unit-Style Test

- `web/src/utils/__tests__/importDraftStorage.test.ts` exists and is written in a Vitest-compatible style.
- Instead of importing `describe`, `it`, and `expect`, it reads them from `import.meta.vitest`.
- The file builds its own mock `sessionStorage` and `window` environment.

What it covers:

- saving draft state
- loading draft state
- clearing draft state
- draft isolation by parse ID
- overwrite behavior

Uncertainty:

- `web/package.json` does not declare `vitest` or a `test` script.
- No standalone Vitest config file was found in the sampled repo files.

That means the file is present and intentionally test-shaped, but the standard project command for running it is not obvious from the current repository state.

## Playwright Coverage

### Config Files

The repo contains multiple Playwright configs rather than one canonical config:

- `web/playwright.phase1.config.cjs`
- `web/playwright.phase2.config.cjs`
- `web/playwright.phase3.config.cjs`
- `web/playwright-temp/playwright.config.cjs`

### Spec Files

Observed browser specs:

- `web/playwright-temp/category-picker-phase1.spec.cjs`
- `web/playwright-temp/tag-picker-phase2.spec.cjs`
- `web/playwright-temp/tag-picker-phase3.spec.cjs`
- `web/playwright-temp/tag-style.spec.cjs`

### Characteristics

- Tests target specific UI redesign or bug-fix phases rather than the whole app.
- Browser target is Chromium.
- Some configs require a local Chrome binary at `/usr/bin/google-chrome`.
- Some configs set `baseURL` to `http://127.0.0.1:5173`.
- Timeout values and `headless` settings vary by config.

Observed implication:

- These look like focused regression harnesses for specific component iterations, not a unified end-to-end suite for the full product.

## Harnesses and Test Artifacts

- `web/src/test-harness/` contains harness sources for category and tag picker flows.
- `web/dist-harness/` contains built harness artifacts.
- `web/category-picker-harness.html` and `web/tag-picker-harness.html` are standalone harness entry points.
- `web/test-results/` and `web/tag-style-shots/` are committed artifacts from prior browser test runs.

Observed implication:

- The frontend team appears to use disposable or phase-scoped harnesses to validate complex selectors and interaction flows.

## How Tests Appear To Be Run

### Backend

High-confidence commands, inferred from file layout and dependencies:

```bash
cd server
pytest
```

Or targeted runs such as:

```bash
cd server
pytest tests/test_installments.py
pytest tests/test_budgets.py
```

### Frontend Playwright

Likely commands, inferred from installed dependencies and config names:

```bash
cd web
npx playwright test -c playwright.phase1.config.cjs
npx playwright test -c playwright.phase2.config.cjs
npx playwright test -c playwright.phase3.config.cjs
```

For the temp config with explicit base URL:

```bash
cd web
npx playwright test -c playwright-temp/playwright.config.cjs
```

### Frontend Unit-Style Test

Low-confidence inference:

- If Vitest is installed elsewhere or expected globally, the utility test could likely run under Vitest.
- The current `package.json` does not document that path.

## Testing Strengths

- Backend business logic has targeted coverage for core financial workflows.
- Tests use realistic domain seed data rather than trivial mocks.
- Playwright specs focus on nuanced selector UX where regressions are easy to miss manually.
- Utility persistence logic has at least one focused frontend test.

## Testing Risks and Gaps

- No obvious frontend `test` script exists.
- Frontend unit test tooling is not clearly declared in `web/package.json`.
- Playwright coverage is phase-specific and may not represent the current full route set.
- No obvious API-level backend integration tests were sampled.
- No obvious CI wiring was inspected in the current repo slice, so automated execution on change is uncertain.
- Built artifacts and prior test outputs are committed, which can obscure which tests are still authoritative.

## Confidence Notes

High confidence:

- `pytest` is the backend testing framework in active use.
- Backend tests are primarily service-level with in-memory SQLite setup.
- Playwright is used for frontend interaction/regression checks.

Lower confidence:

- The canonical command for running frontend unit tests is unclear.
- It is unclear whether all Playwright specs are still maintained as active gates versus historical phase artifacts.
