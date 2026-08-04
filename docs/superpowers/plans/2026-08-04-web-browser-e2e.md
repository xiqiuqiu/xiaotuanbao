# Web Browser E2E Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地本地可跑的 Playwright 浏览器 E2E（冒烟 + 薄建团路径），根命令 `pnpm test:e2e:web`，不进 CI。

**Architecture:** `apps/web-e2e` 独立包；假定本机已起 web(5173)+api(3000)；角色用 seed 账号；断言只验可达性。

**Tech Stack:** Playwright、pnpm workspace、`apps/web-e2e`

**Spec:** [docs/superpowers/specs/2026-08-04-web-browser-e2e-design.md](../specs/2026-08-04-web-browser-e2e-design.md)

## Global Constraints

- 不修改 `.github/workflows/verify.yml`
- 无 postinstall 强制下载浏览器；README 写明 `pnpm exec playwright install`
- 选择器优先 role/文案；禁止 Ant hash class

---

### Task 1: Scaffold + auth smoke

**Files:**
- Create: `apps/web-e2e/package.json`, `playwright.config.ts`, `support/*`, `tests/auth.smoke.spec.ts`, `README.md`
- Modify: root `package.json` scripts; `docs/agents/verification.md`

- [x] 创建包与配置（workers:1，baseURL，timeout，trace on-first-retry）
- [x] 实现 `loginAs` / credentials / paths
- [x] 实现 auth smoke（登录→工作台→退出）
- [x] 根脚本 + verification 文档
- [x] `pnpm install` + `playwright install chromium` 后跑通 auth

### Task 2: Remaining smokes + create flow

**Files:**
- Create: `workbench|departure|finance.smoke.spec.ts`, `departure-create.flow.spec.ts`

- [x] workbench / departure（主 Tab）/ finance 四页
- [x] wangjie 手动建团（`e2e-web-` 团名）并在列表可见
- [x] `pnpm test:e2e:web` 全绿
- [x] Commit
