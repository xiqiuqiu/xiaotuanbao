# Catalog — audit axes × catalog fixes

Bar details live in [DESIGN.md](../../../DESIGN.md). This file is the checklist: detect → fix. Apply the **positive** fix; do not invent parallel styling.

Reference list skeleton: `apps/web/src/pages/system/EmployeesPage.tsx`.

| ID | Axis | Detect | Catalog fix |
|----|------|--------|-------------|
| A1 | Single primary | Same decision surface (page header, drawer/modal footer) has ≥2 `type="primary"` | Demote secondary actions to `default` / `text` / `link`; keep one primary |
| A2 | Token color | Business UI hard-codes primary/surface/neutral hex (`#1677ff`, `#fff`, `#fafafa`, ad-hoc greys) | `theme.useToken()` or antd semantic props (`type="secondary"`, `status`, Tag `color="success"`…) |
| A3 | Functional vs preset | Preset palette used for primary affordance or nav selected state | Primary/status via functional colors; presets only for Tag/chart/category |
| A4 | List skeleton | List/module page missing header + filter Card + table Card + Drawer/Modal pattern | Align to DESIGN「标准列表页」and `EmployeesPage` |
| A5 | Title ladder | Wrong `Typography.Title` level for scene (list default is `level={4}` + secondary paragraph) | Match DESIGN 标题层级表 |
| A6 | 4px grid | Gaps/margins/paddings not multiples of 4 (esp. magic 11/13/15); filter↔table gap ≠ 16 | Snap to 8/16/24 (page content margin 16) |
| A7 | Radius / elevation / motion | Pill primary buttons; hand-rolled heavy shadows; custom `cubic-bezier` | antd defaults / shadow & motion tokens; full radius only for avatar/badge dots |
| A8 | Form chrome | Create/edit not in Drawer (~480) with vertical Form; footer not 取消 default + primary | Drawer + `layout="vertical"` + footer Space right-aligned |
| A9 | Table chrome | Default zebra striping; pagination missing `showSizeChanger` / `showTotal: 共 n 条` | Drop zebra; add pagination affordances per DESIGN |
| A10 | State certainty | Missing loading / empty / error / success feedback on the page's main data or mutations | Table `loading`+Empty; `message`/`Alert`/`Spin` as DESIGN Feedback section |
| A11 | Tag vs Alert | Tag used for blocking/error feedback | `Alert` (or Modal) for blocking; Tag for category/status labels |
| A12 | Destructive | Row/page destructive action without DESIGN-appropriate confirm when the flow is blocking | `Popconfirm` / `Modal`; row actions as `link` + `danger` when appropriate |
| A13 | Surfaces | Extra full-page fake card wrapper; hard-coded layout bg | Rely on layout `colorBgLayout` + container Cards; read tokens |
| A14 | Copy (optional) | UI strings contradict `CONTEXT.md` terms | Reword to glossary terms |

## Severity hints

- **P0:** A1 on one surface; A12 when confirm is required; A10 when user cannot tell outcome; A11 when error is Tag-only and blocking.
- **P1:** A2–A9, A13 drifts.
- **P2:** A5 polish; A14; minor A6 inconsistencies inside otherwise correct skeletons.
- **waive:** Login shell pale primary→white gradient; antd-internal legacy paddings; detail routes that already use dedicated detail pages (supplier/partner).
