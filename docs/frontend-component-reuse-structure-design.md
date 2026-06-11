# <img src="/icons/icon.svg" width="24" style="vertical-align: -6px;" /> Frontend Component Reuse and Structure Design

## Goal

Improve frontend reuse and make the component tree easier to navigate without changing existing props, behavior, or visual styling.

This is a conservative refactor. The first implementation pass should prefer small shared wrappers and directory boundary cleanup over large file moves.

## Current Observations

- The frontend is a Vite/React app under `frontend/src`.
- `frontend/src/components/common` already contains shared building blocks such as `Button`, `IconButton`, `Input`, `Select`, `PanelHeader`, `PanelSearchInput`, `EmptyState`, `Pagination`, `EditorSidebar`, `ConfirmDialog`, and viewer helpers.
- `docs/frontend/ui-components.md` already documents the preferred generic UI primitives, so new reusable pieces should extend that system instead of creating a parallel one.
- The largest component areas are `chat`, `panels`, `common`, `layout`, and `documents`.
- `components/panels` mixes root panel files, feature subdirectories, shared panel helpers, and sidebar/session parts.
- `components/selectors` has duplicated modal shell patterns across `SkillSelector`, `ToolSelector`, and `AgentModeSelector`.
- Some local feature components duplicate common patterns intentionally. For example, `fileLibrary/components/EmptyState.tsx` uses a richer file-library illustration and should not be blindly replaced by `common/EmptyState`.

## Non-Goals

- Do not redesign the UI.
- Do not rename public component props unless a backward-compatible adapter keeps old callers working.
- Do not rewrite business logic while extracting presentational structure.
- Do not move large feature folders in the first pass unless imports are very localized.
- Do not replace intentionally distinct product surfaces such as landing, chat composer, and file-library rich empty states just to increase a reuse metric.

## Recommended Approach

### Approach A: Conservative Reuse First

Extract a few shared structures from duplicated markup while leaving feature files mostly where they are.

Recommended because it improves reuse with low visual risk and keeps diffs reviewable.

Likely targets:

- Selector modal shell used by `SkillSelector`, `ToolSelector`, and `AgentModeSelector`.
- Selector action bar button styling used by skill/tool selector batch actions.
- Shared body scroll lock hook for modal/sheet surfaces.
- Small grouped-list shell pieces for selector category headers where markup is identical enough.
- Documentation updates in `docs/frontend/ui-components.md` after the shared components exist.

### Approach B: Directory Structure Cleanup

Clarify ownership boundaries with index files and targeted folder grouping, but avoid moving the entire frontend tree in one pass.

Useful changes:

- Keep `components/common/ui` for primitives.
- Keep `components/common` for cross-feature app components.
- Treat `components/selectors` as shared selector-modal infrastructure plus selector feature components.
- Move panel-only utility helpers into `components/panels/_shared` only if several panels consume them.
- Convert root panel files one at a time into feature folders when they already have sibling helpers.

Example future target:

```text
frontend/src/components/
  common/
    ui/
    panels/
    overlays/
    viewers/
  selectors/
    shared/
    SkillSelector.tsx
    ToolSelector.tsx
    AgentModeSelector.tsx
  panels/
    _shared/
    MarketplacePanel/
    MemoryPanel/
    ModelPanel/
    ScheduledTaskPanel/
```

The first implementation pass should not force this full structure. It should introduce only the pieces needed by the current duplication.

### Approach C: Broad Feature Folder Migration

Move many components into a stricter `features/*` layout.

Not recommended for this pass. It would create a large import-only diff and make it harder to verify that styling and behavior did not change.

## Proposed First Pass

### 1. Shared Selector Modal Shell

Create a shared component near the existing selector infrastructure:

- `frontend/src/components/selectors/SelectorModalShell.tsx`

Responsibilities:

- Render the repeated rounded modal container.
- Preserve exact class names currently used by selector modals:
  `sm:rounded-2xl rounded-t-2xl shadow-2xl w-full sm:w-[40%] sm:min-w-[600px] min-h-[40vh] sm:max-h-[80vh] max-h-[85vh] max-h-[85dvh] flex flex-col overflow-hidden`
- Preserve the inline style `background: var(--theme-bg-card)` on the container.
- Stop propagation on container click.
- Accept `ref`, `children`, optional `className`, and optional `style`.

Initial consumers:

- `frontend/src/components/selectors/SkillSelector.tsx`
- `frontend/src/components/selectors/ToolSelector.tsx`
- `frontend/src/components/selectors/AgentModeSelector.tsx`

### 2. Shared Selector Header

Create:

- `frontend/src/components/selectors/SelectorModalHeader.tsx`

Responsibilities:

- Render mobile drag handle, icon tile, title, subtitle, and close button.
- Preserve the same spacing, border, colors, icon sizing, and close-button classes.
- Accept `icon`, `title`, `subtitle`, `onClose`, and optional class overrides only when needed.

Initial consumers:

- `SkillSelector`
- `ToolSelector`

`AgentModeSelector` should be checked before adoption because its header content may differ.

### 3. Shared Selector Action Bar

Create:

- `frontend/src/components/selectors/SelectorActionBar.tsx`

Responsibilities:

- Provide the repeated selector action row container classes.
- Provide a small `SelectorActionButton` for text/icon actions with the exact current button class strings.
- Allow custom right-side actions such as "add tool" / "go to marketplace".

Initial consumers:

- `SkillSelector`
- `ToolSelector`

This is low risk because it keeps all business callbacks inside each selector.

### 4. Shared Scroll Lock Hook

Create:

- `frontend/src/hooks/useBodyScrollLock.ts`

Responsibilities:

- Preserve the previous body overflow value before locking.
- Restore the previous value on close/unmount.
- Accept `locked: boolean`.

Initial consumers:

- `SkillSelector`
- `ToolSelector`
- `AgentModeSelector`

Follow-up candidates after verification:

- `ProfileModal`
- `ShareDialog`
- `FeedbackDialog`
- `SessionPreviewDialog`
- `ConfirmDialog`

Do not update all modal users in the first pass. Start with selector modals only.

### 5. Directory Clarity Without Large Moves

Add a selector shared export:

- `frontend/src/components/selectors/shared.ts` or `frontend/src/components/selectors/index.ts`

Use it only for selector-local shared pieces. Do not export selector internals through `common`.

For panels, document the intended structure before moving files. A follow-up pass can split root-level panel files when each move is small and testable.

## Candidate Later Refactors

- Standardize panel-only empty/result states that currently match `common/EmptyState`.
- Extract repeated list item headers from MCP tool policy/sidebar views if markup remains aligned after selector work.
- Review `SettingsPanel.tsx`, `RolesPanel.tsx`, `UsersPanel.tsx`, and `ChannelPanel.tsx` for common form footer/action row usage.
- Consider moving viewer-related files from `common` into `common/viewers` after import churn is justified.
- Consider `components/panels/_shared` for panel table/list row helpers after at least two panels use the same component.

## Verification Plan

Before implementation:

- Confirm current tests are runnable from `frontend`.
- Identify source-level tests that assert UI primitive usage or selector modal source patterns.

After each extraction:

- Run TypeScript build:

```bash
cd frontend
pnpm build
```

- Run targeted tests if available:

```bash
cd frontend
pnpm exec tsx --test src/components/selectors/__tests__/*.test.ts
```

- If selector tests are source-based rather than render-based, update them only to reflect the new shared component boundary.

Visual safety checks:

- Compare selector modal container class strings before and after extraction.
- Keep all Tailwind class strings in the new shared components identical to the old markup.
- Do not change item row markup in the first pass.
- Do not change translation keys.

## Acceptance Criteria

- Shared selector modal shell/header/action components remove duplicate markup from at least two selector components.
- The extracted components preserve existing class names, inline styles, aria labels, and callback behavior.
- The frontend TypeScript build passes.
- Existing source tests pass or are updated only for intentional file-boundary changes.
- Documentation names the new reusable selector components and keeps `docs/frontend/ui-components.md` aligned with the new guidance.

## Open Question

Before coding, choose the first implementation scope:

- Conservative selector-only pass: safest and recommended.
- Selector pass plus panel directory cleanup: more useful, but more import churn.
- Full frontend structure cleanup: highest churn and not recommended until smaller passes are complete.
