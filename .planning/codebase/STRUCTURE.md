# Structure

## Top Level

The repository is split into two application roots plus project metadata:

- `server/`: FastAPI backend, database migrations, tests, local DB artifacts
- `web/`: React frontend, build/test harnesses, static output artifacts
- `src/`: a very small top-level Python package stub (`src/__init__.py`), not the main backend application root
- `data/`: a top-level SQLite database file is present in the repo root
- `.planning/`: planning/documentation workspace, including this codebase map

## Backend Layout

Backend code lives under `server/src/`.

### `server/src/main.py`

Application entrypoint:

- creates the FastAPI app
- installs CORS
- initializes the database on startup
- registers all module routers

### `server/src/core/`

Cross-cutting backend infrastructure:

- `config.py`: environment-backed settings, DB URL, JWT settings, CORS origins
- `database.py`: SQLAlchemy engine/session/base plus startup schema repair helpers
- `auth.py`: current-user dependency based on bearer token auth
- `security.py`: token/password security helpers
- `exceptions.py`: application exception types
- `logger.py`: business/audit logging helpers
- `cache.py`: cache helpers used by business services

### `server/src/common/`

Shared domain utilities and constants:

- `dates.py`: business/local-date helpers
- `enums.py`: shared enum definitions such as transaction/account types
- `constants.py`, `utils.py`: common support code

### `server/src/modules/`

Feature modules, generally following the same file shape:

- `models.py`: SQLAlchemy models
- `schemas.py`: Pydantic schemas
- `service.py`: business logic
- `router.py`: HTTP endpoints
- `__init__.py`: module exports

Observed modules:

- `auth`
- `books`
- `accounts`
- `account_balance_snapshots`
- `categories`
- `transactions`
- `installments`
- `loans`
- `imports`
- `import_templates`
- `rules`
- `recurring_rules`
- `recurring_pending`
- `reports`
- `tags`
- `budgets`
- `wishlists`
- `durable_assets`
- `bills`

Notable exceptions to the standard shape:

- `accounts/rebuild.py`: account-specific rebuild logic
- `rules/defaults.py`: default rule definitions
- `bills/parsers/`: parser implementations for specific bill sources (`alipay`, `wechat`, `jd`, etc.)
- `account_balance_snapshots/`: currently appears model-only from the file list I inspected

### `server/migrations/`

Alembic migration assets:

- `env.py`
- `script.py.mako`
- `versions/00x_*.py`

This is the formal migration directory, even though runtime schema repair also exists in `core/database.py`.

### `server/tests/`

Backend automated tests, mainly integration-style test modules grouped by domain:

- `test_reports.py`
- `test_bills_parse.py`
- `test_transfer.py`
- `test_transactions_refund.py`
- `test_budgets.py`
- `test_account_balance_trend.py`
- `test_installments.py`
- `test_tags.py`

### Other Backend Directories

- `server/scripts/`: ad hoc operational scripts
- `server/src/scripts/`: additional source-adjacent scripts
- `server/data/`: local database backups and SQLite files
- `server/seeds/`: seed-related assets
- `server/logs/`: runtime logs
- `server/.venv`, `server/.venv-pytest`: local virtual environments committed or retained in-tree

## Frontend Layout

Frontend code lives under `web/src/`.

### `web/src/main.tsx`

Frontend bootstrap:

- mounts the React app
- wraps it with theme and Ant Design providers
- imports global styles

### `web/src/App.tsx`

This is currently the largest frontend file and appears to be the main runtime shell.

Responsibilities visible from inspection:

- `BrowserRouter` mounting
- auth-gated route tree
- top-level layout and navigation drawer
- lazy loading for several pages
- some page/container logic inline

There is also an `App.tsx.backup`, which is a repo artifact rather than a normal source file.

### `web/src/router.tsx`

Alternative router definition using `createBrowserRouter`.

Important note:

- `main.tsx` renders `App`, not this router.
- That means `router.tsx` is not obviously the active route entrypoint today.

### `web/src/pages/`

Route-level screens and feature pages, including:

- dashboard and summaries
- transaction entry and transfer flows
- installment creation and installment task management
- imports and import template editing
- reports pages
- tags, budgets, assets, wishlists, settings

This folder contains many pages beyond the smaller set exposed in `web/src/router.tsx`, which reinforces that `App.tsx` is currently the primary route host.

### `web/src/components/`

Reusable UI pieces such as:

- transaction list/detail surfaces
- category and tag pickers
- modal/drawer forms
- budget and reporting cards
- import staging table

### `web/src/services/`

- `api.ts`: shared fetch wrapper, auth header attachment, JSON/error handling, and some report helper functions

### `web/src/contexts/`

- `AuthContext.tsx`: auth state/context wiring

### `web/src/stores/`

- `appStore.ts`: Zustand-based shared state

### `web/src/hooks/`

- `useTheme.tsx`: theme selection and Ant Design algorithm integration

### `web/src/auth/`

- `session.ts`: session retrieval used by the alternate router

### `web/src/charts/`

- ECharts-based chart components

### `web/src/utils/`

Utility code such as:

- `hierarchySelection.ts`
- `importDraftStorage.ts`

### `web/src/test-harness/`

Standalone harness entrypoints for component-level or focused UI verification:

- `categoryPickerHarness.tsx`
- `tagPickerHarness.tsx`

## Frontend Support Files and Artifacts

Outside `web/src/`, the frontend tree also contains:

- `vite.config.ts` and `vite.harness.config.ts`
- `playwright.phase*.config.cjs`
- `playwright-temp/`: temporary Playwright specs
- `dist/` and `dist-harness/`: built artifacts
- `test-results/`: saved Playwright output
- `category-picker-harness.html` and `tag-picker-harness.html`: standalone harness pages
- `tag-style-shots/`: screenshot artifacts

These indicate the repo currently keeps generated and experimental frontend artifacts in-tree, not just source code.

## Data and Environment Files

Observed data/config artifacts include:

- `server/.env` and `server/.env.example`
- `server/personal-finance.db`
- `server/data/app.db.bak` and dated backup files
- top-level `data/app.db`

The presence of multiple SQLite files and backups suggests development data is stored directly in the repo workspace.

## Structural Observations

### Strongest Consistency

The backend module layout is the most consistent structural pattern in the repo: router/schema/service/model by domain.

### Largest Structural Outlier

`web/src/App.tsx` is the main structural outlier because it combines shell, routing, and substantial feature code in one very large file.

### Likely Transitional Areas

The following areas look transitional or partially migrated:

- frontend routing (`App.tsx` vs `router.tsx`)
- committed build/test artifacts in `web/`
- multiple DB file locations and backup files

## Uncertainties

- I did not inspect every source file, so some directories may have more specific internal conventions than listed here.
- The top-level `src/` package may be vestigial or used for tooling; it does not appear to be the main backend app root from this pass.
- Some generated artifacts may be intentional fixtures rather than accidental commits, but the structure alone does not establish that.
