# Category Refactor Report

## Scope

Completed the category system refactor for `personal-finance` in the following areas:

1. Income/expense parent-child lineage isolation on backend and frontend.
2. Cancel/back behavior for category create and edit pages.
3. Active-state and duplicate-name logic cleanup.
4. Strict safe-delete flow with backend validation and frontend delete action.

## Backend Changes

### `server/src/modules/categories/models.py`

- Added `is_deleted` to `Category` for soft delete support.

### `server/src/modules/categories/schemas.py`

- Added optional `category_type` to `CategoryUpdate` so edit requests can validate type changes.
- Exposed `is_deleted` in `CategoryResponse`.

### `server/src/modules/categories/service.py`

- Added parent existence and parent type validation in `create_category`.
- Added the same parent type validation in `update_category`.
- Added protection against changing a category type when the category still has children.
- Updated duplicate-name checks to include inactive categories and exclude only soft-deleted rows.
- Updated category queries to always exclude `is_deleted=True`.
- Replaced old delete behavior with strict soft delete:
  - reject delete if child categories exist
  - reject delete if any transaction references the category
  - otherwise mark `is_deleted=True`

### `server/src/modules/categories/router.py`

- Kept the existing `DELETE /categories/{category_id}` endpoint and aligned it with the new soft-delete behavior.

### `server/migrations/versions/006_category_soft_delete.py`

- Added Alembic migration to create `categories.is_deleted` with default `false`.

## Frontend Changes

### `web/src/App.tsx`

- Category create form:
  - parent options now filter by selected `category_type`
  - added `取消` button using `navigate(-1)`
- Category edit form:
  - parent options now filter by selected `category_type`
  - clears invalid parent selection when type changes
  - `取消` now uses `navigate(-1)`
- Category management list:
  - now requests `include_inactive=true`
  - displays inactive categories instead of filtering them out
  - shows gray `已停用` tag for inactive categories
  - adds red delete button per category with delete confirmation
  - delete errors use backend-returned messages from the shared API layer

## Verification

Executed:

- `python3 -m py_compile server/src/modules/categories/models.py server/src/modules/categories/schemas.py server/src/modules/categories/service.py server/src/modules/categories/router.py server/migrations/versions/006_category_soft_delete.py`
- `npm run build` in `web/`

Results:

- Python compile check passed.
- Frontend production build passed.

## Notes

- Existing unrelated worktree changes were present in:
  - `server/src/modules/accounts/schemas.py`
  - `server/src/modules/accounts/service.py`
  - local env/database files
- Those files were not modified as part of this refactor.
