# Code Conventions

## Scope

This document summarizes conventions that are observable in the current repository. It is descriptive, not prescriptive. Where the codebase is inconsistent or incomplete, that is called out explicitly.

## Backend Conventions

### Module Shape

Most backend business areas live under `server/src/modules/<feature>/` and commonly split into:

- `models.py` for SQLAlchemy ORM models
- `schemas.py` for Pydantic request/response models
- `service.py` for business logic and database operations
- `router.py` for FastAPI endpoints and dependency wiring
- `__init__.py` for re-exports in some modules

This is a strong pattern across modules such as `tags`, `transactions`, `budgets`, `accounts`, `imports`, and `installments`.

### Import Style

- Imports are mostly absolute from `src...` on the backend.
- Feature-local imports often use relative paths for sibling files such as `.models`, `.schemas`, `.service`.
- There is no universally enforced import sorting format visible in the checked files.

### Naming

- Python identifiers use `snake_case`.
- ORM classes and Pydantic classes use `PascalCase`.
- Route handler names are short verbs such as `create`, `get`, `list_tags`, `refund`, `transfer`.
- Service helpers often use `get_*`, `create_*`, `update_*`, `delete_*`.

### API Layer Patterns

- Routers are created with feature prefixes such as `APIRouter(prefix="/tags", tags=["tags"])`.
- Dependency injection is the default pattern for auth and database access via `Depends(...)`.
- Many feature routers define a local `get_current_book_id(...)` helper to derive `book_id` from the authenticated user and default book.
- Error translation usually happens in routers by catching `ValueError` and raising `HTTPException(status_code=400, ...)`.
- Some services raise `HTTPException` directly instead of staying transport-agnostic. `tags/service.py` is an example, so the service boundary is not uniformly pure.

### Persistence and Transactions

- SQLAlchemy ORM is used directly; there is no repository abstraction.
- `get_db()` yields a session and commits on success, rolls back on exception.
- Services also frequently call `db.commit()` and `db.refresh(...)` themselves.

Observed implication:
- Transaction ownership is mixed between the request dependency and service functions. That works, but it means commit boundaries are not fully standardized.

### Database Modeling

- Tables generally use UUID-like string primary keys (`String(36)`), often generated in application code.
- Timestamps commonly use `created_at` and `updated_at` with `server_default=func.now()`.
- Boolean lifecycle flags are common: `is_active`, `is_deleted`, `is_system`, `is_default`.
- Multi-tenant scoping is primarily by `book_id`.
- SQLite compatibility is important. `server/src/core/database.py` contains schema backfill helpers for legacy databases.

### Data Representation

- Monetary values are commonly `Decimal` on the backend.
- Enums are represented through shared constants in `src/common/enums.py`, but many persisted values are still stored and passed around as strings.
- Some fields that behave like structured data are stored as JSON strings in text columns. `Transaction.tags` is handled this way in `tags/service.py`.

Observed implication:
- The data model favors pragmatic compatibility over strict normalization.

### Response Conventions

- Many endpoints use Pydantic `response_model=...`.
- Some delete/mutation endpoints return a shared success envelope through `success_response(...)`.
- List endpoints are inconsistent: some return bare arrays, others wrap items with totals and paging metadata (for example transaction summaries).

### Comments and Inline Markers

- Chinese comments are common and often explain business intent.
- Some comments include a `🛡️ L:` marker to flag guarded logic or fixes. This appears to be a local annotation convention rather than a framework-level pattern.

## Frontend Conventions

### Language and File Layout

- Frontend source lives under `web/src/`.
- React components and pages use `.tsx`; utilities and service helpers use `.ts`.
- Component/page filenames use `PascalCase`.
- Utility and store filenames use `camelCase` or lower camel compound names such as `appStore.ts`, `importDraftStorage.ts`.

### Routing and Page Structure

- Routing is centralized in `web/src/router.tsx`.
- Pages are lazy-loaded with `React.lazy(...)`.
- Route guarding is handled by a small async loader that checks `getSession()`.
- The router currently exposes a limited route surface compared with the number of page files present, so route registration is selective rather than exhaustive.

### API Access

- Network access is centralized in `web/src/services/api.ts`.
- `apiFetch` handles token injection.
- `apiJson` handles JSON parsing, FastAPI-style `detail` extraction, auth expiry handling, and Ant Design message display.
- Convenience wrappers follow HTTP verb naming: `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`, `apiUpload`.
- Query parameters for backend APIs generally use backend-style names such as `book_id`, `date_from`, `exclude_tag_ids`.

Observed implication:
- The frontend does not attempt to translate API naming to client-native casing; it largely mirrors backend contracts.

### State Management

- Local component state uses hooks directly.
- Shared app state uses Zustand in `web/src/stores/appStore.ts`.
- The shared store is small and event-like: refresh counters, dirty flags, and UI toggles rather than normalized domain state.

### Component Style

- Many components use inline style objects instead of CSS modules or styled components.
- Ant Design is used, but not as the sole styling system. Custom buttons/layouts with CSS variables and inline styles are common.
- Some components export pure helpers alongside React components, such as `hexToRgba` and `buildGroups` in `TagMultiSelect.tsx`.

### TypeScript Patterns

- Types are frequently declared inline in the same file as the component or helper.
- Generics are used where components need reusable ID/value handling, as in `TagMultiSelect<T extends TagId>`.
- The codebase does not show a strong preference for semicolons. Some files include them consistently; others are lighter.

## Cross-Cutting Naming and Contract Conventions

### Casing

- Python/backend: `snake_case`
- TypeScript component/type names: `PascalCase`
- TypeScript variables/functions: `camelCase`
- API query/body fields that map closely to backend models often remain `snake_case`

### Business Context

- Domain language is finance-specific and fairly explicit: `installments`, `repayment`, `frozen_amount`, `credit_limit`, `usage_count`, `include_hidden`.
- Chinese copy appears throughout comments, test data, and user-facing messages. The product appears Chinese-first.

### Error Handling

- Backend usually communicates errors through `HTTPException.detail`.
- Frontend error handling is built around that FastAPI response shape and falls back to `message` or `error` fields.

## Known Inconsistencies

- Commit ownership is mixed between dependency-managed sessions and service-layer commits.
- Some services raise framework exceptions directly; others raise plain `ValueError`.
- API responses are not fully uniform across endpoints.
- Frontend routing coverage does not match the full set of page files, so page presence does not guarantee route exposure.
- Test conventions exist but are not wired through obvious package scripts in the frontend.

## Confidence Notes

High confidence:

- Backend module layering (`router` / `service` / `schemas` / `models`)
- Widespread `book_id` scoping
- Centralized frontend API wrapper pattern
- Small Zustand-based shared store pattern

Lower confidence:

- There may be additional undocumented conventions in modules not sampled here.
- No formatter/linter config was inspected, so style enforcement appears inferred from source shape rather than tooling.
