# Web 浏览器 E2E（本地）

Playwright 冒烟 + 一条薄建团写路径。**不进 CI**；业务正确性仍由 API e2e 负责。

设计说明见 [`docs/superpowers/specs/2026-08-04-web-browser-e2e-design.md`](../../docs/superpowers/specs/2026-08-04-web-browser-e2e-design.md)。

## 前置

1. Postgres：`pnpm db:up`（已 migrate / seed）
2. API：`pnpm dev:api`（默认 `:3000`）
3. Web：`pnpm dev:web`（默认 `:5173`）
4. 首次安装浏览器二进制：

```bash
pnpm --filter web-e2e exec playwright install chromium
```

## 命令

仓库根目录：

```bash
pnpm test:e2e:web        # headless 全套
pnpm test:e2e:web:ui     # Playwright UI 调试
```

## 账号（seed 默认）

| 用途 | 用户名 | 密码 |
|------|--------|------|
| 冒烟 | `mazong` | `admin123` |
| 建团写路径 | `wangjie` | `admin123` |

可用环境变量覆盖：`WEB_E2E_BASE_URL`、`WEB_E2E_ADMIN_USER`、`WEB_E2E_ADMIN_PASSWORD`、`WEB_E2E_COORDINATOR_USER`、`WEB_E2E_COORDINATOR_PASSWORD` 等。

## 覆盖范围

- 登录 / 登出
- 工作台打开
- 发团列表 → 详情主 Tab（无数据时跳过详情）
- 财务：应收 / 应付 / 流水 / 核销页打开
- 计调新建发团草稿（团名 `e2e-web-*`）

不测完整财务闭环、视觉回归。
