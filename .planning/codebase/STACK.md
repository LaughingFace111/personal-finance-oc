# Stack

## Overview

This repository is a full-stack personal finance application with:

- A Python/FastAPI backend in `server/`
- A React/TypeScript single-page frontend in `web/`
- SQLite as the active local database, with Alembic migration scaffolding and PostgreSQL called out as a future/production path in docs

## Backend Runtime

### Language and framework

- Python 3.12 is the documented backend runtime in [README.md](/home/joshua/Desktop/personal-finance/README.md)
- FastAPI `0.109.0` provides the HTTP API in [server/src/main.py](/home/joshua/Desktop/personal-finance/server/src/main.py)
- Uvicorn `0.27.0` is the ASGI server from [server/requirements.txt](/home/joshua/Desktop/personal-finance/server/requirements.txt)

### Data and validation

- SQLAlchemy `2.0.25` is the ORM and engine layer in [server/src/core/database.py](/home/joshua/Desktop/personal-finance/server/src/core/database.py)
- Pydantic `2.5.3` and `pydantic-settings` `2.1.0` handle request/response schemas and app settings
- `python-dateutil` `2.8.2` supports date/business-day logic
- `cachetools` `5.3.2` is available for in-process caching

### Auth and request handling

- JWT auth uses `python-jose[cryptography]` `3.3.0`
- Password hashing uses `passlib[bcrypt]` `1.7.4`
- Multipart/form-data support uses `python-multipart` `0.0.6`
- Environment loading uses `python-dotenv` `1.0.0`

### File and spreadsheet support

- `openpyxl` `3.1.5` is installed; this suggests spreadsheet import/export support, though the exact call sites were not inspected in this pass

## Persistence

### Active database

- Default database URL is `sqlite:///data/app.db` in [server/src/core/config.py](/home/joshua/Desktop/personal-finance/server/src/core/config.py)
- The SQLAlchemy engine enables SQLite `check_same_thread=False`
- The repo includes multiple SQLite database artifacts:
  - `server/data/app.db`
  - `data/app.db`
  - backup files under `server/data/`
  - `server/personal-finance.db`

### Migration and schema strategy

- Alembic is configured in [server/alembic.ini](/home/joshua/Desktop/personal-finance/server/alembic.ini)
- Migration scripts live in `server/migrations/versions/`
- Startup also performs schema self-healing in `init_db()`:
  - creates metadata tables
  - backfills legacy installment columns/indexes
  - backfills budget columns
  - backfills tag/category usage counters

This means schema evolution currently uses a hybrid of:

- formal Alembic revisions
- runtime SQLite compatibility patches

## Frontend Runtime

### Language and framework

- React `18.2.0`
- TypeScript `5.3.3`
- Vite `5.0.8`
- `@vitejs/plugin-react` `4.2.1`

### UI and state

- Ant Design `5.12.0` is the primary component library
- `@ant-design/icons` `5.2.6` provides icon assets
- `@tanstack/react-query` `5.14.0` is installed for async state/query management
- Zustand `4.4.7` is installed for client-side app state
- `dayjs` `1.11.10` is available for date handling
- `decimal.js` `10.6.0` is available for precise decimal arithmetic

### Charts and data presentation

- ECharts `5.4.3`
- `echarts-for-react` `3.0.2`
- `react-window` `1.8.10` for list virtualization

### CSV and import tooling

- `papaparse` `5.5.3`
- `@types/papaparse` is included in `dependencies` rather than `devDependencies`

### Styling

- Tailwind CSS `4.2.2` is integrated through `@tailwindcss/vite`
- `postcss` and `autoprefixer` are present
- Ant Design theme tokens are customized in [web/src/main.tsx](/home/joshua/Desktop/personal-finance/web/src/main.tsx)
- The frontend also keeps project CSS in `web/src/index.css` and `web/src/styles.css`

## Build and Dev Tooling

### Frontend scripts

`web/package.json` currently exposes:

- `npm run dev`
- `npm run build`
- `npm run preview`

No dedicated `test`, `lint`, or `typecheck` npm scripts were visible in the inspected file.

### Vite server and bundling

[web/vite.config.ts](/home/joshua/Desktop/personal-finance/web/vite.config.ts) configures:

- dev server on `0.0.0.0:5173`
- `/api` proxy to `http://localhost:8000`
- explicit allowed hosts for LAN and tunnel domains
- manual Rollup chunking for React, Ant Design, and ECharts-heavy bundles

## Testing Tooling Present in the Repo

These tools are part of the effective stack even though some are configured ad hoc:

- `pytest` for backend tests under `server/tests/`
- Playwright `@playwright/test` `1.59.1` for browser/UI checks
- A Vitest-style test file exists at `web/src/utils/__tests__/importDraftStorage.test.ts`, using `import.meta.vitest`

Uncertainty:

- I did not find a top-level Vitest dependency or test script in `web/package.json`, so that test may rely on tooling not shown in the inspected package manifest, or it may be dormant/incomplete.

## Operational Characteristics

- Backend and frontend are developed as separate apps connected over HTTP
- CORS is explicitly configured with localhost, LAN IP, and multiple tunnel domains in [server/src/core/config.py](/home/joshua/Desktop/personal-finance/server/src/core/config.py)
- Frontend auth state depends on a token stored in `localStorage`, as seen in [web/src/services/api.ts](/home/joshua/Desktop/personal-finance/web/src/services/api.ts)
- The backend exposes a REST-style `/api/*` surface plus `/health`

## Notable Stack Observations

- The backend is conventional FastAPI + SQLAlchemy, but with significant SQLite compatibility logic at startup
- The frontend mixes Ant Design theming with Tailwind-based styling infrastructure
- Test infrastructure exists across multiple tools, but script standardization is incomplete from the files inspected
- The repository contains built frontend artifacts, Playwright temp files, and local database files, so the effective working stack includes checked-in generated/runtime outputs in addition to source code
