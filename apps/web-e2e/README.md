# Web 浏览器与真实 AI 回归

确定性 P0 浏览器用例进入 `Verify / api-e2e` 门禁；完整浏览器套件与真实 AI 用例在本地验收。金额、权限、关闭门禁和财务守恒的详细断言仍由 API e2e 承担。

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
- 可选：AI 建团 `basic_info` 纯文字冒烟（默认跳过；需打开协助开关并用确定性无头 Agent）
- #452 继续提交应付：Continue 仅 confirmed 算已提交；应付确认入口可见（协作夹具，不测关闭门禁/金额守恒）
- #456 业务验收样例卡片：明确总价字段 + 空证据/OCR 冲突红路径可见态（确定性夹具）

不测完整财务闭环、视觉回归。真实模型场景由 `WEB_E2E_LIVE_AI=true` 显式启用；真实 OCR 不在默认套件内。

## AI 建团本地冒烟（#323）

默认跳过。本地要跑「发文字 → 待审核 → 表单确认写入草稿 → 刷新仍在」：

1. `pnpm db:up` 且已 seed
2. `.env` 打开协助，并用确定性无头结果（不要接真实模型）：

```env
AI_CREATE_ASSIST_ENABLED=true
AGENT_HEADLESS_ADAPTER=deterministic
AGENT_HEADLESS_OUTCOME={"kind":"awaiting_review","reviewPackage":{"objectVersion":1,"confirmationUnit":"basic_info_draft","candidates":[{"fieldKey":"name","proposedValue":"e2e-ai-basic-info-name","clarity":"clear","evidence":[{"kind":"user_message","sequence":1,"excerpt":"团名"}]}]}}
```

3. `pnpm dev:api`（含 workflow-worker）+ Agent + `pnpm dev:web`
4. `pnpm test:e2e:web` 会执行 `ai-create-basic-info.smoke.spec.ts`

`objectVersion` 必须是新建任务草稿的 `1`。上述旧建团冒烟保持可选。真实模型业务验收使用下方独立场景，不依赖这个旧冒烟开关。

## 确定性 P0（CI 门禁）

```bash
pnpm test:e2e:web:p0
# 聚焦某个边界（仍创建并清理独立数据库和服务）
pnpm test:e2e:web:p0 -- --grep '发送响应丢失'
```

仅需本地 Postgres 与 Garage 配置可用；runner 自己构建 API、创建带所有权标记的私有 schema、迁移和 seed，启动独立 API、Worker、Vite 与确定性 Agent，结束后停止自有进程并删除私有 schema。它不会替换开发中的模型、服务或数据库。故障控制入口只在 runner 内监听本机随机端口并使用临时控制密钥，不属于产品 API。

`tests/agent-p0.spec.ts` 的 16 条用例覆盖：

- 发送持久化与刷新恢复；待审核刷新、确认及正式结果重读。
- 发送已受理但响应丢失，以及丢失后刷新再重试：同一会话、同一批次，无重复输入。
- 双击确认、确认响应丢失、两个标签页并发确认：无 500、成功结果不重复。
- 拒绝、取消、旧审核与人工修改冲突：不误写，会话可继续。
- 运行中连续输入 FIFO，以及离线和刷新后队列恢复。
- 澄清期间独立查询保留原问题，显式回答后继续。
- API 或 Worker 重启后恢复待审核，确认仍只写一次；执行中的 Worker 重启后接管同一批次且不重复交付。

每次运行的证据在 `test-results/p0-<runId>/`；保留浏览器失败截图/trace，以及公开 API 的会话事件、审核和正式行程快照。CI 自动上传这些证据。

## 真实 AI：12 个独立场景

使用正在运行的本地 Web、API、Worker 和真实 Agent；新建 `e2e-live-*` 测试团，不删除已有业务数据：

```bash
WEB_E2E_LIVE_AI=true pnpm --filter web-e2e exec playwright test \
  tests/agent-boundaries.live.spec.ts tests/agent-business.live.spec.ts \
  --retries=0 --trace=retain-on-failure --output=test-results/live-ai
```

| 场景 | 必须观察的业务结果 |
| --- | --- |
| 操作咨询 | 有具体正文，无假完成或业务写入 |
| 运行中 FIFO | 独立输入依次完成，审核前不写入，确认后可重读 |
| 同名目标澄清 | 不擅选；独立查询保留追问，显式回答后只改目标 |
| 离线刷新 | 批次、审核恢复，正式写入不重复 |
| 否定修改 | 只查询，不生成审核或改变数据 |
| 混合查询与变更 | 答复和审核都交付，不漏事项 |
| 正式事实更新 | 人工更新后重新读取，不沿用旧回答 |
| 拒绝建议 | 不写入，后续查询不把被拒建议当事实 |
| 会话隔离 | 新会话查询不串入旧会话未确认建议 |
| 变更值缺失 | 先追问，回答后形成并确认审核 |
| 用户修正 | 最终写入修正值，保留其他记录 |
| 完整业务闭环 | AI 建团 → 客源/资源 → 初始应收/应付审核 → 确认 → 刷新及重新查询；账款不重复且没有实际收付 |

每条用例保存会话、审核、正式行程与截图；完整闭环另验证正式客源/资源及应收应付。使用真实模型的通过率只代表该次运行，失败须区分产品缺陷、模型语义失误和测试环境问题，不用自动重试掩盖首轮失败。
