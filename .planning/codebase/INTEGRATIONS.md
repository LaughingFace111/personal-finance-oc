# Integrations

## Overview

The application is primarily an internally integrated system: a React SPA talks to a FastAPI backend, which persists to SQLite and performs domain workflows for finance, imports, reporting, and scheduled items. I did not find evidence of third-party SaaS APIs in the inspected files; most integrations are local runtime, browser, or infrastructure integrations.

## Frontend-to-Backend Integration

### HTTP API boundary

- The frontend calls the backend through relative `/api/*` URLs in [web/src/services/api.ts](/home/joshua/Desktop/personal-finance/web/src/services/api.ts)
- In development, Vite proxies `/api` to `http://localhost:8000` in [web/vite.config.ts](/home/joshua/Desktop/personal-finance/web/vite.config.ts)
- The backend mounts many routers under `/api` in [server/src/main.py](/home/joshua/Desktop/personal-finance/server/src/main.py)

### Auth token flow

- The frontend reads a bearer token from `localStorage`
- Authenticated requests set `Authorization: Bearer <token>`
- On `401` or `403`, the frontend clears the token, shows an Ant Design message, and redirects to `/login`

This is a tight browser-to-API integration with no separate auth proxy or session service visible in the inspected files.

## Browser and UI Library Integrations

### Ant Design

- Ant Design is integrated at the application root through `ConfigProvider` in [web/src/main.tsx](/home/joshua/Desktop/personal-finance/web/src/main.tsx)
- The app uses:
  - locale integration via `zh_CN`
  - theme algorithm selection from `useTheme()`
  - component token overrides for cards, inputs, messages, notifications, selects, modals, drawers, and menus
- Ant Design's `message` API is also used directly in the shared API client for request error feedback

### React Router

- The frontend routing layer uses `createBrowserRouter` from `react-router-dom`
- Route-level guards call `getSession()` before loading protected pages in [web/src/router.tsx](/home/joshua/Desktop/personal-finance/web/src/router.tsx)
- Page code-splitting uses `React.lazy()` and `Suspense`

### Theme and browser storage

- Theme state is integrated through `ThemeProvider` and `useTheme()`
- Authentication depends on browser `localStorage`
- Some utility tests reference `sessionStorage`, indicating additional browser-storage integration in the import flow

## Backend Framework Integrations

### FastAPI framework services

- FastAPI supplies:
  - request routing
  - OpenAPI/docs generation by default
  - dependency injection patterns
  - response validation through Pydantic schemas

### CORS

- `CORSMiddleware` is configured in [server/src/main.py](/home/joshua/Desktop/personal-finance/server/src/main.py)
- Allowed origins are provided by settings in [server/src/core/config.py](/home/joshua/Desktop/personal-finance/server/src/core/config.py)
- The configured origins include:
  - local dev hosts
  - one LAN IP
  - multiple `loca.lt`, `cpolar.top`, and `cpolar.cn` tunnel domains

This suggests active remote-device or public-tunnel testing as part of the development workflow.

## Persistence and Schema Integrations

### SQLAlchemy

- SQLAlchemy integrates the backend domain/services with the database engine and ORM models
- Sessions are injected through `get_db()` in [server/src/core/database.py](/home/joshua/Desktop/personal-finance/server/src/core/database.py)
- Transaction boundaries are handled in the dependency by commit/rollback/close behavior

### SQLite

- SQLite is the active default persistence layer
- The backend contains SQLite-specific compatibility logic:
  - `ALTER TABLE` backfills
  - index creation
  - legacy schema normalization

This is more than a passive database choice; SQLite-specific behavior is embedded into app startup.

### Alembic

- Alembic is integrated for migration management under `server/migrations/`
- The configured Alembic URL also points at SQLite

Uncertainty:

- The README mentions PostgreSQL as a production path, but I did not inspect any active PostgreSQL-specific runtime configuration or deployment files in this pass.

## Import and File Handling Integrations

### Browser uploads

- The frontend supports multipart uploads through `apiUpload()` in [web/src/services/api.ts](/home/joshua/Desktop/personal-finance/web/src/services/api.ts)
- The shared API client intentionally avoids forcing `Content-Type` for `FormData`, allowing the browser to set the multipart boundary correctly

### Parsing libraries

- `papaparse` on the frontend indicates CSV parsing in the browser or import-prep flows
- `openpyxl` on the backend indicates spreadsheet handling support server-side

Uncertainty:

- I did not inspect the exact import pipeline implementation end-to-end, so these libraries are documented as present integrations rather than fully traced execution paths.

## Reporting and Visualization Integrations

### Charts

- ECharts integrates into the frontend through `echarts-for-react`
- Vite build chunking treats ECharts and ZRender as a dedicated bundle, which means charting is large enough to influence deployment/bundle strategy

### Report query helpers

- `web/src/services/api.ts` includes a specialized `getExpenseByCategory()` helper that serializes repeated query params for category/tag exclusions
- This is a concrete integration point between frontend report filters and backend report endpoints

## Test and Harness Integrations

### Playwright

- Playwright is installed and configured in multiple focused config files:
  - `web/playwright.phase1.config.cjs`
  - `web/playwright.phase2.config.cjs`
  - `web/playwright.phase3.config.cjs`
  - `web/playwright-temp/playwright.config.cjs`
- This indicates the UI test harness is organized around targeted work phases rather than a single consolidated suite

### Harness pages

- The repo contains:
  - `web/category-picker-harness.html`
  - `web/tag-picker-harness.html`
  - `web/src/test-harness/*`
  - `web/dist-harness/*`

These files indicate a separate component-level/manual-validation integration path outside the main app shell.

## Environment and Local Tooling Integrations

### Environment variables

- Backend settings load from `.env` via `pydantic-settings`
- `SECRET_KEY` is required and not defaulted in [server/src/core/config.py](/home/joshua/Desktop/personal-finance/server/src/core/config.py)

### Local tunnel workflow

- Multiple tunnel domains are hard-coded in backend CORS and frontend allowed hosts
- This is effectively an integration with external tunneling tools, though the tool binaries/configs were not inspected

## External Service Footprint

Based on the files inspected, the codebase does not appear to integrate with:

- payment processors
- bank APIs
- cloud storage APIs
- hosted auth providers
- message queues
- analytics SDKs

That absence may be meaningful: the product appears to be a self-contained personal finance system rather than a service aggregator.

## Integration Risks and Friction Points

- Frontend auth depends on token storage in `localStorage`, which couples session behavior to browser state
- CORS and Vite host allowlists require manual maintenance as tunnel domains change
- Runtime schema repair logic couples application startup to database migration behavior
- Checked-in local database files and built harness outputs create operational overlap between source artifacts and runtime/generated artifacts
