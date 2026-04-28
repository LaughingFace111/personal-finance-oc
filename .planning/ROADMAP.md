# Roadmap: Personal Finance

## Overview

This roadmap delivers the current picker UX release in three sequenced phases, then follows with an account-detail transaction-list unification phase and a transaction-detail/refund interaction phase: first the category picker interaction redesign, then the tag picker search-and-frequency flow, then the multi-select completion bar and confirm-close behavior, then reuse of the main transactions list presentation on the account detail page without changing its account/month scope or replacing its existing month selector control, and finally partial refunds plus a centered transaction detail modal that preserves user context.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Category Picker Redesign** - Replace direct top-level category selection with a focused grid-to-sub-panel flow.
- [ ] **Phase 2: Tag Picker Redesign** - Add the frequent-tags plus persistent-search tag selection flow.
- [ ] **Phase 3: Selection Completion Flow** - Add the summary bottom bar and auto-close completion behavior.
- [ ] **Phase 4: Account Transaction List Unification** - Reuse the main transactions page list on account detail while preserving account and month filtering context.
- [ ] **Phase 5: Partial Refunds And Transaction Detail Modal** - Add cumulative partial refunds from transaction detail and replace transaction-detail page opens with a centered modal that preserves list context.

## Phase Details

### Phase 1: Category Picker Redesign
**Goal**: Deliver the new category selection flow with a flat top-level grid, dedicated expanded sub-panels, and back navigation that preserves context within a selection session.
**Depends on**: Nothing (first phase)
**Requirements**: [CATP-01, CATP-02, CATP-03, CATP-04, CATP-05]
**Success Criteria** (what must be TRUE):
  1. User can open category selection and see a flat top-level grid of icon+text category tiles.
  2. Tapping a top-level category opens a dedicated expanded category view instead of selecting the category immediately.
  3. The expanded category view replaces the top-level grid and provides an explicit back action.
  4. Returning with the back action preserves the previously expanded category context for repeated edits in the same flow.
**Plans**: TBD

Plans:
- [ ] 01-01: Plan category picker component structure and state transitions
- [ ] 01-02: Implement top-level grid and expanded sub-panel navigation behavior
- [ ] 01-03: Verify preserved context and regression coverage for category selection flows

### Phase 2: Tag Picker Redesign
**Goal**: Deliver the hybrid tag picker with frequent tags, persistent search, and a searchable flat list that switches cleanly into search mode.
**Depends on**: Phase 1
**Requirements**: [TAGP-01, TAGP-02, TAGP-03, TAGP-04]
**Success Criteria** (what must be TRUE):
  1. User can see frequent tags at the top of the tag picker when search is not active.
  2. User can use a persistent search input that remains visible at the top of the tag picker.
  3. User can browse all tags in a searchable flat list below the search input.
  4. Frequent tags are hidden whenever the user is actively searching.
**Plans**: TBD

Plans:
- [ ] 02-01: Plan tag picker data presentation and search state behavior
- [ ] 02-02: Implement frequent tags, persistent search input, and flat list browsing
- [ ] 02-03: Verify search-mode behavior and regression coverage for tag selection flows

### Phase 3: Selection Completion Flow
**Goal**: Make multi-select completion status visible and fast by adding an expandable summary bottom bar and immediate picker close on confirm.
**Depends on**: Phase 2
**Requirements**: [SELC-01, SELC-02]
**Success Criteria** (what must be TRUE):
  1. User can see the current multi-select completion state in an expandable summary bottom bar.
  2. Confirming the current selection immediately closes the picker after completion.
  3. The completion interaction works consistently with the updated category and tag picker flows.
**Plans**: TBD

Plans:
- [ ] 03-01: Plan bottom bar interaction and confirm-close lifecycle integration
- [ ] 03-02: Implement expandable summary bar and immediate close-on-confirm behavior
- [ ] 03-03: Verify completion UX across category and tag multi-select flows

### Phase 4: Account Transaction List Unification
**Goal**: Replace the account detail page's transaction list presentation with the main transactions page list component or rendering path while preserving account-only and selected-month filtering semantics and keeping the account detail page's own month selector.
**Depends on**: Phase 3 (roadmap sequencing; no known hard technical dependency yet)
**Requirements**: [TXU-01, TXU-02, TXU-03, TXU-04, TXU-05]
**Success Criteria** (what must be TRUE):
  1. Account detail renders transactions through the same list component or rendering path used by the main transactions page.
  2. Account detail still shows only transactions for the currently viewed account.
  3. Account detail still respects the currently selected month.
  4. The change unifies list presentation without replacing the account detail page with the full transactions page experience.
  5. Account detail keeps its existing month selector control instead of adopting the main transactions page filter UI.
**Plans**: TBD

Plans:
- [ ] 04-01: Plan how to extract or reuse the main transactions list component inside account detail without broadening filters or page behavior
- [ ] 04-02: Keep the account detail month selector as-is while documenting the boundary between the shared list renderer and the account-local month filter control
- [ ] 04-03: Implement the unified transaction list and verify account-only plus selected-month behavior on account detail

### Phase 5: Partial Refunds And Transaction Detail Modal
**Goal**: Add partial refunds initiated from transaction detail and unify all transaction-detail entry points behind a centered modal that preserves background list context, supports in-modal editing, and clearly communicates refund progress.
**Depends on**: Phase 4
**Requirements**: [PRTA-01, PRTA-02, PRTA-03, PRTA-04, PRTA-05, PRTA-06, PRTA-07, TXDM-01, TXDM-02, TXDM-03, TXDM-04, TXDM-05, TXDM-06]
**Success Criteria** (what must be TRUE):
  1. User can start a partial refund from transaction detail, enter the amount manually, optionally add a reason, and choose the refund date.
  2. Partial refunds create separate linked refund transactions, preserve the original transaction, and never allow cumulative refunds above the remaining refundable amount.
  3. Original transaction detail shows original amount, refunded amount, remaining refundable amount, linked refund records, and the same `已全额退款` state for both direct full refunds and accumulated partial refunds.
  4. All transaction-detail entry points open the same centered modal instead of navigating away or using divergent detail surfaces.
  5. Closing the modal returns the user to the exact previous page, list, and scroll position.
  6. Editing happens inside the same modal, and refund information renders before remarks in detail view mode.
**Plans**: TBD

Plans:
- [ ] 05-01: Plan the backend refund contract and aggregated refund-status data needed for partial refunds and consistent full-refund labeling
- [ ] 05-02: Implement the transaction-detail partial-refund flow with manual amount, optional reason, manual date, linked refund display, and remaining-amount validation
- [ ] 05-03: Replace transaction-detail page opens with a centered modal that preserves return context and supports in-modal editing

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Category Picker Redesign | 0/3 | Not started | - |
| 2. Tag Picker Redesign | 0/3 | Not started | - |
| 3. Selection Completion Flow | 0/3 | Not started | - |
| 4. Account Transaction List Unification | 0/3 | Not started | - |
| 5. Partial Refunds And Transaction Detail Modal | 0/3 | Not started | - |

## Phase 6 — 首页快捷模板 + 交易复制增强（2026-Q2）
- **功能**：7 首页快捷模板、8 交易复制增强
- **目标**：减少重复输入的快捷方式和智能复制
- **复杂度**：低
- **依赖**：无

## Phase 7 — 导出能力（2026-Q3）
- **功能**：3 导出能力
- **目标**：支持 CSV/Excel/PDF 导出备份和分析
- **复杂度**：中
- **依赖**：Phase 6

## Phase 8 — 账户归档 + 订阅固定账单中心（2026-Q3/Q4）
- **功能**：4 账户归档、6 订阅/固定账单中心
- **目标**：账户生命周期管理 + 固定支出集中视图
- **复杂度**：中
- **依赖**：Phase 6, Phase 7

## Phase 9 — 账户对账（2026-Q4）
- **功能**：2 账户对账
- **目标**：按账单对账流程，识别差异
- **复杂度**：高
- **依赖**：Phase 8

## Phase 10 — 交易拆分（2026-Q4/Q1-2027）
- **功能**：1 交易拆分
- **目标**：一笔拆多分类，精确计算
- **复杂度**：高
- **依赖**：Phase 9

## Phase 11 — 报销垫付管理（2027-Q1）
- **功能**：5 报销/垫付管理
- **目标**：代付/报销工作流跟踪
- **复杂度**：高
- **依赖**：Phase 10

## Phase 12 — 净资产总览（2027-Q2）
- **功能**：9 净资产总览
- **目标**：跨账户/资产/负债净资产仪表盘
- **复杂度**：中
- **依赖**：Phase 8, 9, 10, 11
