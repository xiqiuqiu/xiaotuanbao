---
name: ui-audit
description: 按 DESIGN.md 对单个页面做 Ant Design 合规审计，并按 catalog fix 修复。
disable-model-invocation: true
---

# UI Audit

**Compliance** audit of one **page** against root `DESIGN.md`, then **catalog fix** for defects. Not taste. Not business Spec (that is `/code-review`).

## Branches

| Branch | When | Path |
|--------|------|------|
| `audit-and-fix` | Default; user names a page | Steps 0→4 |
| `audit-only` | User says 只审查 / 先别改 | Stop after step 2 |
| `fix-from-report` | User points at an existing findings list | Skip to step 3 |

## Steps

### 0. Scope the page

Lock **one** page: route, page file, or feature entry. If missing, list candidates under `apps/web/src` and ask — never default to a whole-app sweep.

Collect the file set: page + its Filters / Drawer / Modal / column helpers in scope.

**Done when:** exactly one entry path and a written file set.

### 1. Load the bar

Read [DESIGN.md](../../../DESIGN.md). Open [catalog.md](catalog.md) and keep it beside the audit. For component API questions, use `/antd` — do not paste antd docs here.

**Done when:** you can name the bar (`DESIGN.md` + every catalog axis).

### 2. Audit (compliance pass)

Before any code change: walk **every** axis in [catalog.md](catalog.md) against **every** file in the set. Prefer source; use a running preview only as a supplement.

Each finding: `file:locus` · symptom · DESIGN clause · catalog fix id · `P0|P1|P2`.  
DESIGN-allowed exceptions → `waive` (not in the fix queue).

Emit the report (see Output).

**Done when:** every catalog axis is marked pass / finding(s) / waive; every in-scope file was touched; the report is written. **No edits before this criterion.**

### 3. Fix (catalog fixes only)

Default: apply catalog fixes for all **P0** and **P1**. **P2** only if the user asked or the same hunk is already open and scope stays on this page.

One finding → its catalog fix (or the isomorphic pattern on `EmployeesPage`). Query props via `/antd` when unsure.

**Done when:** every P0/P1 is fixed or explicitly skipped with reason.

### 4. Re-audit the diff

Re-check only the axes touched by the diff.

**Done when:** no new P0/P1; user receives: fixed list · leftover P2 · waives.

## Severity (single table)

| Level | Meaning | Default |
|-------|---------|---------|
| P0 | Breaks **certain** / **meaningful** action (e.g. two primaries on one decision surface; destructive with no confirm where DESIGN requires it; critical status color-only) | Fix |
| P1 | Token / skeleton / 4px-grid drift from DESIGN | Fix |
| P2 | Title level, secondary text API, minor consistency | Optional |
| waive | Explicitly allowed by DESIGN | Skip |

## Output

```markdown
## UI audit — <page>

**Branch:** audit-and-fix | audit-only | fix-from-report
**Files:** …

### Findings
| ID | Sev | Locus | Symptom | DESIGN | Catalog fix |
|----|-----|-------|---------|--------|-------------|
| F1 | P1 | … | … | … | … |

### Waives
- …

### Fixes applied
- F1 → …

### Left as P2 / skipped
- …
```
