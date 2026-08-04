# 浏览器级 Web E2E（本地）设计

日期：2026-08-04  
状态：已对齐（待实现）

## 目标

为系统主要功能补一批**浏览器级**端到端用例，覆盖：

- 冒烟：登录/登出、工作台、发团列表→详情主 Tab、财务四页可打开
- 一条薄写路径：计调新建发团草稿并在列表可见

**不进 CI 门禁**。通过根目录脚本本地手动运行。业务正确性（金额、状态机、权限矩阵）继续由 API e2e / 契约测负责。

## 非目标

- 不把浏览器 E2E 加入 `.github/workflows/verify.yml` 或 C1 required checks
- 不测完整「生成应收 → 登记 → 核销」闭环（已有 `finance-journey` 等）
- 不做视觉/像素回归
- 不自动拉起 postgres / api / web（假定开发者已启动）

## 方案

采用 **Playwright 独立包**（方案 A）：

| 项 | 决定 |
|----|------|
| 位置 | `apps/web-e2e/`（与 `apps/web` Vitest 分离） |
| 工具 | Playwright |
| baseURL | `http://localhost:5173`（可用 `WEB_E2E_BASE_URL` 覆盖） |
| API | 经现有 Vite proxy → `localhost:3000` |
| CI | 不接入；verification 文档仅注明可选本地命令 |

`pnpm-workspace.yaml` 已含 `apps/*`，无需改 workspace 列表。

## 目录结构

```text
apps/web-e2e/
  package.json
  playwright.config.ts
  README.md
  tests/
    auth.smoke.spec.ts
    workbench.smoke.spec.ts
    departure.smoke.spec.ts
    finance.smoke.spec.ts
    departure-create.flow.spec.ts
  support/
    auth.ts
    urls.ts
```

## 命令

根 `package.json`：

| 脚本 | 行为 |
|------|------|
| `pnpm test:e2e:web` | `pnpm --filter web-e2e test` → headless 跑全套 |
| `pnpm test:e2e:web:ui` | Playwright UI 模式（本地调试） |

`apps/web-e2e/package.json` 内提供 `test` / `test:ui`，并文档化首次 `pnpm exec playwright install`（或 `postinstall` 可选，避免强迫所有开发者下浏览器二进制——**推荐 README 手装，不强制 postinstall**）。

## 前置条件（运行前）

1. `pnpm db:up`（及按需 migrate/seed）
2. API：`pnpm dev:api`（或等价）
3. Web：`pnpm dev:web`（端口 5173）
4. Seed 演示账号可用（见下）

未起服务时用例应快速失败并提示检查 baseURL，而不是长时间挂起（合理 timeout）。

## 账号

| 用途 | 用户名 | 密码 | 角色 |
|------|--------|------|------|
| 冒烟（菜单最全） | `mazong` | `admin123` | 企业管理员 |
| 薄写路径（建团） | `wangjie` | `admin123` | 计调 |

可用环境变量覆盖账号/密码（实现时命名：`WEB_E2E_ADMIN_USER` 等），默认上述 seed。

## 用例与断言

| 文件 | 角色 | 行为 | 断言边界 |
|------|------|------|----------|
| `auth.smoke` | mazong | `/login` 登录 → `/`；退出登录 | 离开 login；工作台/壳可见；回到 login |
| `workbench.smoke` | mazong | 打开 `/` | 主区域可见，不白屏 |
| `departure.smoke` | mazong | `/departure` → 进一团详情 → 点主 Tab | 列表或空态；详情 URL；各主 Tab 面板挂载 |
| `finance.smoke` | mazong | 打开 `/finance/receivable`、`/payable`、`/transactions`、`/verification` | 每页标题或主表容器可见；未踢回 login（复用管理员 storageState） |
| `departure-create.flow` | wangjie | `/departure/new` 最小必填创建草稿 → 列表可见 | 成功提示或进详情；列表出现 `e2e-web-` 前缀标识；**不**断言财务金额 |

发团详情仅覆盖实际存在的主 Tab（概览 / 客源 / 执行 / 财务相关等），不进入深层抽屉表单。

列表无团时：`departure.smoke` 可依赖同次运行中写路径已造团，或对「无数据」走空态断言并 skip 详情（实现计划里二选一，优先：写路径先跑或 `testDescribe.configure({ mode: 'serial' })` 保证有一团）。

## 选择器约定

1. 优先 `getByRole` / `getByLabelText` / 稳定中文文案  
2. 其次 URL  
3. 必要时**最小量** `data-testid`（登录区、创建提交、列表行）；不为图表/动画加 testid  
4. 禁止依赖易变的 Ant Design hash class名

## 稳定性

- 写路径串行；冒烟可有限并行
- 统一偏长 timeout，适配 Ant Design 表格/抽屉
- 登录可复用 `storageState`（管理员会话）；计调写路径单独登录
- 失败保留 trace / screenshot（on-first-retry）
- 写路径团名/团号使用 `e2e-web-` + 时间戳；本地不强制清理

## 文档变更

- 新增 `apps/web-e2e/README.md`（前置、命令、账号、范围）
- `docs/agents/verification.md` 增补「可选本地浏览器 E2E」小节，明确**非** C1、不挡合并

## 与现有验证层关系

```text
typecheck / React Doctor / permission-matrix
        ↓
API Jest e2e（CI 必过）—— 业务正确性主防线
        ↓
Web Vitest（本地；CI 仍 deferred）
        ↓
Playwright web-e2e（本设计：仅本地手动）—— 壳与主路径可达性
```

## 后续（本设计不做）

- CI 非必过 job
- CI required 冒烟
- 更多写路径（核销、伙伴等）
