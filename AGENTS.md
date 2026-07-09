# Agent instructions

## Agent skills

### Issue tracker

GitHub Issues on `xiqiuqiu/xiaotuanbao` via `gh` CLI; external PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped 1:1 to GitHub labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### UI design

Root `DESIGN.md` — Ant Design v6 visual language constraints for `apps/web`. Follow it when building or changing UI.
