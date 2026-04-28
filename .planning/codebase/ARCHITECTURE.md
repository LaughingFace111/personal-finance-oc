# Architecture

## Overview

This repository is a full-stack personal finance application with a Python/FastAPI backend in `server/` and a React/TypeScript frontend in `web/`.

At a high level:

- The backend exposes REST endpoints under `/api`, owns persistence, applies domain rules, and initializes the database on startup.
- The frontend is a client-rendered SPA that authenticates with JWTs, stores the token in browser storage, and calls the backend directly with `fetch`.
- SQLite is the default runtime database. Alembic migrations exist, but the backend also performs SQLite schema backfills at startup to keep older local databases usable.

## Runtime Pieces

### Backend API

The FastAPI entrypoint is `server/src/main.py`.

- `FastAPI(..., lifespan=lifespan)` calls `init_db()` on startup.
- `CORSMiddleware` is configured from `server/src/core/config.py`.
- Routers are registered per business module, all under the `/api` prefix.

The backend is organized around repeated module slices:

- `router.py`: HTTP endpoints and dependency wiring
- `schemas.py`: Pydantic request/response models
- `service.py`: domain logic and persistence orchestration
- `models.py`: SQLAlchemy ORM models

That pattern is visible across modules such as `transactions`, `accounts`, `budgets`, `imports`, `wishlists`, and others.

### Persistence Layer

The database layer lives in `server/src/core/database.py`.

- SQLAlchemy `DeclarativeBase` is the shared ORM base.
- `SessionLocal` is exposed through the `get_db()` dependency.
- Each request-scoped session commits on success and rolls back on exception.
- `init_db()` runs `Base.metadata.create_all()` and then applies SQLite-only compatibility patches for older schemas.

This means the system uses a hybrid schema-management strategy:

- formal migrations in `server/migrations/`
- runtime repair/backfill logic in `server/src/core/database.py`

That is a deliberate compatibility mechanism, but it also means schema truth is not exclusively defined by Alembic.

### Frontend SPA

The frontend entrypoint is `web/src/main.tsx`, which renders `App` inside:

- `ThemeProvider`
- Ant Design `ConfigProvider`
- `React.StrictMode`

`App.tsx` currently appears to be the active application shell:

- it mounts `BrowserRouter`
- it handles auth gating through `ProtectedRoute`
- it defines the primary route tree and shell UI
- it contains a large amount of page and container logic inline

There is also a separate `web/src/router.tsx` built with `createBrowserRouter`, but `main.tsx` does not mount it. Based on the current repo state, that file looks like an alternate or in-progress router rather than the active runtime entry.

## Request and Data Flow

### Authentication Flow

Observed flow:

1. The user logs in from the frontend.
2. The frontend calls `/api/auth/login`.
3. The returned access token is stored in `localStorage`.
4. API helpers in `web/src/services/api.ts` attach `Authorization: Bearer <token>`.
5. Backend endpoints use `get_current_user()` from `server/src/core/auth.py`.
6. The backend decodes the JWT, loads the user, and authorizes the request.

If a request returns `401` or `403`, the frontend clears the token and redirects to `/login`.

### Typical Business Request Flow

A typical write request follows this path:

1. A page or component triggers an action.
2. The frontend uses `apiGet` / `apiPost` / `apiPatch` / `apiDelete`.
3. A FastAPI router validates input and resolves the current user and DB session.
4. A service function executes business rules and database updates.
5. ORM entities or response schemas are returned to the client.

The `transactions` module is a representative example:

- `router.py` handles route-level concerns and request shaping.
- `service.py` contains domain behavior for transfers, refunds, repayments, balance adjustments, and transaction list shaping.
- account balances, debts, frozen credit, and refund metadata are coordinated in service-layer logic.

## Domain Boundaries

The codebase is domain-first rather than layer-first. Key bounded areas include:

- `auth`: user registration/login and JWT identity
- `books`: book ownership and default book resolution
- `accounts`: asset, credit, and loan account behavior
- `transactions`: income/expense/transfer/refund/adjustment workflows
- `installments`: installment plans and execution/revert flows
- `loans`: loan creation and repayment workflows
- `recurring_rules` and `recurring_pending`: scheduled transaction generation and review
- `imports` and `import_templates`: CSV ingestion and mapping
- `reports`: read-heavy reporting endpoints
- `tags`, `categories`, `budgets`, `wishlists`, `durable_assets`, `bills`

The service layer is where these domains are cross-wired. For example, transaction creation interacts with accounts, categories, snapshots, refunds, and cache invalidation.

## Architectural Patterns

### 1. Modular Monolith

This is a modular monolith, not a distributed system.

- one backend process
- one frontend bundle
- one primary relational database
- modules separated by folders and conventions, not by deployment unit

### 2. Router -> Service -> Model Flow

The backend consistently pushes business logic out of route handlers into services. The pattern is not perfectly enforced everywhere without inspecting every file, but it is clearly the dominant design.

### 3. Rich Domain Rules in Services

The system models finance-specific rules in code rather than leaving them to thin CRUD handlers. Examples visible from the repo:

- credit repayment validation
- transfer collapsing for list display
- installment frozen-credit release logic
- account balance/debt side effects based on account type
- local-date and reporting semantics

### 4. Client-Heavy SPA Shell

The frontend shell currently centralizes a lot of behavior in `App.tsx`:

- route declarations
- navigation shell
- some page/container logic
- auth redirect behavior

Newer pages are lazy-loaded, but the overall architecture is still dominated by a large root component.

## Integration Boundaries

Main runtime boundaries appear to be:

- Browser <-> FastAPI JSON API
- FastAPI <-> SQLite via SQLAlchemy
- FastAPI startup <-> Alembic/runtime schema repair

No external SaaS or third-party API integration is obvious from the inspected files. If any exists deeper in the repo, it is not prominent in the current entrypoints and configs I inspected.

## Notable Design Decisions

### Local Business Date Semantics

The README and common date utilities indicate a deliberate "business day" model intended to avoid timezone drift in finance reporting. That is an important domain decision because it affects filtering, summaries, and month-based calculations.

### Multi-Type Account Model

The backend distinguishes account behavior by account type rather than treating all accounts the same. Asset, credit, and loan accounts drive different balance/debt updates, which is central to the financial domain model.

### Startup Schema Self-Healing

The backend patches legacy SQLite schemas at runtime. That reduces local environment breakage, but it also creates a second place where schema evolution lives.

### Parallel Frontend Routing Artifacts

There are two routing approaches in the repo:

- active-looking `BrowserRouter` usage in `App.tsx`
- separate `createBrowserRouter` setup in `web/src/router.tsx`

I cannot prove intent from static inspection alone, but the current code suggests a partial migration or parallel experiment rather than a single settled routing architecture.

## Current Architectural Tensions

### Large `App.tsx`

`web/src/App.tsx` is both shell and substantial feature implementation. That increases coupling between navigation, auth, layout, and feature behavior.

### Split Source of Truth for Routing

The frontend route map is not fully centralized in one place. The mounted route graph lives in `App.tsx`, while `router.tsx` defines a different, smaller route set.

### Schema Evolution in Two Systems

Alembic migrations and runtime SQLite backfills both shape the database schema. That can be practical for legacy support, but it weakens a single authoritative migration path.

## Uncertainties

- I did not inspect every module implementation in depth, so some cross-module relationships may be richer than described here.
- `web/src/router.tsx` may be used by tooling, experiments, or future migration steps even though `main.tsx` currently mounts `App` directly.
- I did not confirm background jobs or scheduled execution mechanisms from the inspected files alone; recurring features are present as modules, but their trigger model is not fully established from this pass.
