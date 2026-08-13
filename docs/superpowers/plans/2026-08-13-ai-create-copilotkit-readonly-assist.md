# AI 建团只读协助：全局助理壳 + CopilotKit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 租户工作台加上全局右侧伸缩助理栏，新建发团页用真实 CopilotKit + AG-UI 做只读多轮对话；其它页只显示未接入说明。

**Architecture:** `MainLayout` 增加右栏壳与插槽。建团页打开右栏后 `POST assist-session`，把委托交给 `<CopilotKit runtimeUrl="/copilotkit">` + `CopilotChat`。`apps/agent` 用 Copilot Runtime + Mastra，唯一工具 `getTaskContext`（taskId/runId 来自请求头，不让模型自填）。不写草稿、不上 HITL / Predictive Updates。

**Tech Stack:** `@copilotkit/react-core/v2`、`@copilotkit/runtime/v2`、`@ag-ui/mastra`、已有 `@mastra/core`、NestJS `assist-session` / `getTaskContext`、Vite 代理 `/copilotkit` → 4111。

**Spec:** [docs/superpowers/specs/2026-08-13-ai-create-copilotkit-readonly-assist-design.md](../specs/2026-08-13-ai-create-copilotkit-readonly-assist-design.md)

## Global Constraints

- 右栏不是浮层、无 mask；中间表单始终可点可填。
- CopilotKit 只做协作 UI / AG-UI；业务对象仍走 `packages/ai-contracts`。
- Agent 工具仅 `getTaskContext`；聊天不得写发团创建草稿。
- 其它业务页不接模型；展开右栏只显示「当前页尚未接入业务辅助」。
- 提交 git 时中文 log，言简意赅；未要求提交则不要 commit。
- 改 `apps/web/**` 后跑 `pnpm typecheck`；提交前若相对 `origin/main` 动了 web/shared，再跑 React Doctor（见 `AGENTS.md`）。

## File map

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/app/store/ui.store.ts` | 右栏折叠状态 |
| `apps/web/src/layouts/assist-pane-slot.tsx` | 当前页向右栏注册内容 |
| `apps/web/src/layouts/AssistPane.tsx` | 右栏壳：拉手、宽度、占位文案 |
| `apps/web/src/layouts/MainLayout.tsx` | 三段：左菜单 · 中间 children · 右栏 |
| `apps/web/src/features/ai-assist/AiCreateAssistChat.tsx` | CopilotKit Provider + CopilotChat + 首轮消息 |
| `apps/web/src/features/departure/components/CreateDepartureWizard.tsx` | 点「AI 辅助」展开右栏并注册会话；删 Drawer |
| `apps/agent/src/assist-request-context.ts` | 从请求头取出委托 / taskId / runId |
| `apps/agent/src/get-task-context.tool.ts` | Mastra 工具，调用现有 `fetchTaskContext` |
| `apps/agent/src/mastra-agent.ts` | Mastra Agent 定义（替换 `mastra-turn.ts` 流式缝） |
| `apps/agent/src/server.ts` | `/health` + 鉴权后把 `/copilotkit*` 交给 Copilot Runtime |

删除：`AiCreateAssistDrawer.tsx`、`ai-create-assist-stream.ts` 及对应测试；`mastra-turn.ts` 在 Runtime 接上后删除。

---

### Task 1: 全局右栏壳（不含 CopilotKit）

**Files:**
- Modify: `apps/web/src/app/store/ui.store.ts`
- Create: `apps/web/src/layouts/assist-pane-slot.tsx`
- Create: `apps/web/src/layouts/AssistPane.tsx`
- Create: `apps/web/src/layouts/AssistPane.module.css`
- Create: `apps/web/src/layouts/AssistPane.test.tsx`
- Modify: `apps/web/src/layouts/MainLayout.tsx`
- Modify: `apps/web/src/layouts/MainLayout.module.css`
- Modify: `apps/web/src/layouts/MainLayout.test.tsx`

**Interfaces:**
- Consumes: 现有 `useUiStore`、`MainLayout` 的 `{children}`
- Produces: `assistPaneCollapsed` / `setAssistPaneCollapsed` / `toggleAssistPane`；`AssistPaneSlotProvider` + `useAssistPaneSlot()`（`content: ReactNode | null`，`setContent`）；`AssistPane` 在无 content 时渲染「当前页尚未接入业务辅助」

- [ ] **Step 1: 写失败测试（右栏默认收起、展开不盖表单、无 content 显示占位）**

在 `AssistPane.test.tsx`：

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '@/app/store/ui.store'
import { AssistPane } from './AssistPane'
import { AssistPaneSlotProvider, useAssistPaneSlot } from './assist-pane-slot'

function SlotSetter({ text }: { text: string }) {
  const { setContent } = useAssistPaneSlot()
  setContent(<p>{text}</p>)
  return null
}

describe('AssistPane', () => {
  beforeEach(() => {
    useUiStore.setState({ assistPaneCollapsed: true })
  })
  afterEach(() => cleanup())

  it('stays collapsed by default and does not mask the main content', async () => {
    const user = userEvent.setup()
    render(
      <AssistPaneSlotProvider>
        <main>发团表单</main>
        <AssistPane />
      </AssistPaneSlotProvider>,
    )
    expect(screen.getByText('发团表单')).toBeVisible()
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: '展开电子化助理' }))
    expect(screen.getByRole('complementary', { name: '电子化助理' })).toHaveAttribute(
      'data-collapsed',
      'false',
    )
    expect(screen.getByText('当前页尚未接入业务辅助')).toBeInTheDocument()
    expect(document.querySelector('[aria-label="关闭侧边栏"]')).toBeNull()
  })

  it('renders the registered page slot instead of the placeholder', () => {
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <AssistPaneSlotProvider>
        <SlotSetter text="建团协助" />
        <AssistPane />
      </AssistPaneSlotProvider>,
    )
    expect(screen.getByText('建团协助')).toBeInTheDocument()
    expect(screen.queryByText('当前页尚未接入业务辅助')).not.toBeInTheDocument()
  })
})
```

在 `MainLayout.test.tsx` 增加：右栏与左菜单并存；`main` 内容仍在。`ui.store` persist `partialize` 须包含 `assistPaneCollapsed`，默认 `true`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web exec vitest run src/layouts/AssistPane.test.tsx`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现**

`ui.store.ts` 增加：

```ts
assistPaneCollapsed: boolean
toggleAssistPane: () => void
setAssistPaneCollapsed: (collapsed: boolean) => void
```

默认 `assistPaneCollapsed: true`，`partialize` 同时持久化它。

`assist-pane-slot.tsx`：React context，`setContent` 在注册组件 unmount 时必须清成 `null`。

`AssistPane.tsx`：收起时不渲染（宽度 0，不留窄拉手）。展开时 `<aside aria-label="电子化助理">` 与中间列（含顶栏）为兄弟，从窗口顶通到底，宽 480px；自有顶栏标题「电子化助理」+ 关闭按钮 `aria-label="收起电子化助理"`。无 mask。无 slot 时显示「当前页尚未接入业务辅助」。

`MainLayout.tsx`：用 `AssistPaneSlotProvider` 包住现有结构。中间列 = Header + `{children}`；`AssistPane` 是 shell 的第三列，不要放进 Header 下方的内容行。中间顶栏右侧放「展开电子化助理」按钮。不要把右栏放进 Ant Drawer。

保证 `.app-content` 仍 `flex: 1; min-width: 0; overflow: auto`。`max-width: 767px` 时右栏可用 `position: absolute; inset-inline-end: 0` 贴右侧，仍然无 mask（窄屏不把中间压没）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web exec vitest run src/layouts/AssistPane.test.tsx src/layouts/MainLayout.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求提交时）**

```bash
git add apps/web/src/app/store/ui.store.ts apps/web/src/layouts
git commit -m "$(cat <<'EOF'
feat(工作台): 增加全局右侧电子化助理伸缩栏

为后续 CopilotKit 接入铺三段式壳：左菜单、中间业务页、右侧可收起助理栏，默认收起且不遮罩表单。
EOF
)"
```

---

### Task 2: Agent 改为 Copilot Runtime + getTaskContext 工具

**Files:**
- Modify: `apps/agent/package.json`（加 `@copilotkit/runtime`、`@ag-ui/mastra`、`zod`）
- Create: `apps/agent/src/assist-request-context.ts`
- Create: `apps/agent/src/assist-request-context.spec.ts`
- Create: `apps/agent/src/get-task-context.tool.ts`
- Create: `apps/agent/src/get-task-context.tool.spec.ts`
- Create: `apps/agent/src/mastra-agent.ts`
- Modify: `apps/agent/src/server.ts`
- Modify: `apps/agent/src/server.spec.ts`
- Modify: `apps/agent/src/main.ts`
- Delete after Runtime 接上：`apps/agent/src/mastra-turn.ts`、`mastra-turn.spec.ts`（指令迁到 `mastra-agent.ts`，沿用 `buildAssistModelPrompt` 的 instructions）

**Interfaces:**
- Consumes: `fetchTaskContext`、`loadAgentConfigFromEnv`、`buildAssistModelPrompt`（或把 instructions 内联进 `mastra-agent.ts` 并保留 `readonly-turn.ts` 的中文字段规则）
- Produces: `runWithAssistRequestContext({ delegationToken, taskId, runId }, fn)`；`createGetTaskContextTool(config)`；`createAiCreateMastra(config)`；`createAgentServer` 对 `POST/GET /copilotkit*` 走 Copilot Runtime；无 `Authorization` 返回 401 + `DELEGATION_INVALID`

请求头约定（前端 Task 3 必须同名）：

- `Authorization: Bearer <delegationToken>`
- `X-Ai-Task-Id: <taskId>`
- `X-Ai-Run-Id: <runId>`

工具 `inputSchema` 为空对象或忽略模型入参，一律从 ALS 读这三个值，防止模型改 taskId。

- [ ] **Step 1: 写失败测试（ALS + 工具双身份调用 + 无 Bearer 401）**

`assist-request-context.spec.ts`：`runWithAssistRequestContext` 内 `getAssistRequestContext()` 返回写入值；外面调用则抛错。

`get-task-context.tool.spec.ts`：mock `fetchTaskContext`，在 ALS 内 `execute()`，断言调用参数为 `{ apiBaseUrl, serviceSecret, delegationToken }` 与 `{ taskId, runId }`；`listAgentTools()` 仍为 `['getTaskContext']`。

`server.spec.ts` 替换现有「POST JSON `{taskId,runId}` 自研 SSE」用例为：

```ts
it('rejects copilotkit requests without a delegation bearer', async () => {
  const server = createAgentServer({
    port: 0,
    apiBaseUrl: 'http://api.local',
    serviceSecret: 'secret',
    allowedOrigins: ['http://localhost:5173'],
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  try {
    const response = await originalFetch(`http://127.0.0.1:${port}/copilotkit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload).toMatchObject({
      data: { code: 'DELEGATION_INVALID' },
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
```

保留 `/health` 与 `listAgentTools` 断言。不要再断言自研 `message.delta` JSON。无 key 时创建 Runtime 仍应能听端口；真正跑模型时由 Mastra/映射变成 CopilotKit 可见错误（`mapModelError` 继续用）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter agent test -- assist-request-context.spec.ts get-task-context.tool.spec.ts server.spec.ts`

Expected: FAIL（新文件 / 旧 SSE 断言）

- [ ] **Step 3: 安装依赖并实现**

在仓库根：

```bash
pnpm --filter agent add @copilotkit/runtime @ag-ui/mastra zod
```

`server.ts` 骨架：

```ts
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'
import { createCopilotNodeHandler } from '@copilotkit/runtime/v2/node'
import { MastraAgent } from '@ag-ui/mastra'

// 在 createAgentServer 内：
const mastra = createAiCreateMastra(config)
const runtime = new CopilotRuntime({
  agents: MastraAgent.getLocalAgents({ mastra }),
})
const copilotFetch = createCopilotRuntimeHandler({
  runtime,
  basePath: '/copilotkit',
})
const copilotNode = createCopilotNodeHandler(copilotFetch)

// handleRequest 中：pathname === '/copilotkit' || pathname.startsWith('/copilotkit/')
// 无 Bearer → 401 DELEGATION_INVALID
// 否则 runWithAssistRequestContext({ delegationToken, taskId, runId }, () => copilotNode(request, response))
```

`taskId`/`runId` 从 `X-Ai-Task-Id` / `X-Ai-Run-Id` 读取；缺一则 400 `INVALID_FORMAT`。

`get-task-context.tool.ts` 用 Mastra `createTool`（以安装后的 `@mastra/core/tools` 导出为准），`id` 必须是 `getTaskContext`。`execute` 调 `fetchTaskContext`。无 `modelApiKey` 时 `execute` 抛 `AiCollaborationError.fromCode('AGENT_UNAVAILABLE')`。

`mastra-agent.ts`：`Agent` id 固定 `ai-create-readonly-assist`；`instructions` 使用现有只读规则（中文、不编造、不声称写草稿、只问一个下一步、不重复 filled 字段）；`tools: { getTaskContext }`；model 与现网 DeepSeek 配置相同（`deepseek/deepseek-chat` + `DEEPSEEK_API_KEY` + `AI_MODEL_BASE_URL`）。不要给 Agent 开 Memory（避免 `resourceId` 强制项）。

CORS：继续对允许的 Origin 设置 `Authorization, Content-Type, X-Ai-Task-Id, X-Ai-Run-Id`。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter agent test`

Expected: PASS（含原 `readonly-turn` / `map-agent-error` / `get-task-context.client`）

- [ ] **Step 5: Commit（仅当用户要求提交时）**

```bash
git commit -m "$(cat <<'EOF'
feat(agent): 用 Copilot Runtime 接入 Mastra 只读 getTaskContext

替换自研 /copilotkit SSE，委托与任务/运行标识从请求头进入工具，模型不能改写调用身份。
EOF
)"
```

---

### Task 3: 建团页挂 CopilotKit 聊天并启动协助会话

**Files:**
- Modify: `apps/web/package.json`（加 `@copilotkit/react-core`）
- Create: `apps/web/src/features/ai-assist/ai-create-first-turn.ts`
- Create: `apps/web/src/features/ai-assist/AiCreateAssistChat.tsx`
- Create: `apps/web/src/features/ai-assist/AiCreateAssistChat.test.tsx`
- Create: `apps/web/src/features/ai-assist/useAiCreateAssistBootstrap.ts`
- Create: `apps/web/src/features/ai-assist/useAiCreateAssistBootstrap.test.ts`
- Modify: `apps/web/src/features/departure/components/CreateDepartureWizard.tsx`
- Modify: `apps/web/src/features/departure/components/CreateDepartureWizard.test.tsx`

**Interfaces:**
- Consumes: `startAiCreateAssistSession`、`flushDraft`/`canPersistDepartureCreationDraft`、Task 1 的 `setAssistPaneCollapsed` + `useAssistPaneSlot`、Task 2 的请求头与 `agentId: "ai-create-readonly-assist"`
- Produces: `AI_CREATE_FIRST_TURN` 常量；`AiCreateAssistChat` props：`{ agentRuntimeUrl, delegationToken, taskId, runId, snapshotVersion, stageKey, runStatus }`；`useAiCreateAssistBootstrap({ enabled, flushDraft, buildDraft, taskId, applySavedDraft, syncTaskSearch })` 返回 `{ bootstrap, session, error }`

首轮文案（禁止改写，测试断言同一字符串）：

```ts
export const AI_CREATE_FIRST_TURN =
  '请根据当前草稿说明已填写和仍缺少的信息，并只问一个下一步问题。'
```

- [ ] **Step 1: 写失败测试**

`useAiCreateAssistBootstrap.test.ts`：mock `startAiCreateAssistSession`。调用 `bootstrap()` 时先 `flushDraft`；flush 抛错仍继续 session；session 入参带当前 draft；返回的 session 含 token。

`AiCreateAssistChat.test.tsx`：vi.mock `@copilotkit/react-core/v2`，捕获 `CopilotKit` 的 `runtimeUrl` / `headers` / `properties`，以及 `CopilotChat` 的 `agentId`。断言：

```ts
expect(headers).toMatchObject({
  Authorization: 'Bearer deleg-1',
  'X-Ai-Task-Id': 'task-assist',
  'X-Ai-Run-Id': 'run-1',
})
expect(runtimeUrl).toBe('/copilotkit')
expect(agentId).toBe('ai-create-readonly-assist')
```

`CreateDepartureWizard.test.tsx`：

- 保留「空模板不 POST `/draft`」。
- 「AI 辅助」改为：调用 `setAssistPaneCollapsed(false)`（mock `useUiStore`）并 `startAiCreateAssistSession`；不再渲染 `AI 辅助建团` Drawer 标题。
- 用 `AssistPaneSlotProvider` + 展开的 `AssistPane` 包住 wizard，断言 slot 里出现 Copilot 聊天（mock 组件 `data-testid="copilot-chat"`）。
- 打开后改团名，关闭右栏（点「收起电子化助理」），团名仍在。
- Agent 失败：mock Copilot `onError` 或 bootstrap reject，表单仍能点「创建发团」。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter web exec vitest run src/features/ai-assist src/features/departure/components/CreateDepartureWizard.test.tsx`

Expected: FAIL

- [ ] **Step 3: 安装依赖并实现**

```bash
pnpm --filter web add @copilotkit/react-core
```

`AiCreateAssistChat.tsx`：

```tsx
import { CopilotChat, CopilotKit, useCopilotReadable } from '@copilotkit/react-core/v2'
import '@copilotkit/react-core/v2/styles.css'
```

- `headers` / `properties` 用 `useMemo`。
- `useCopilotReadable` 只传 `aiCreateSharedLightStateSchema` 允许的字段（taskId、stageKey=`basic_info`、runStatus、reviewPackageId=`null`、snapshotVersion、progress=`collecting`），不要传 draft。
- `CopilotChat`：`agentId="ai-create-readonly-assist"`，`labels` 中文（输入框 placeholder：「询问当前发团草稿…」），`className` 让聊天铺满右栏高度。
- 首轮：在 CopilotKit 子组件里用当前包导出的 `useCopilotChat` / `useAgent`（以安装后的类型为准）发送一次 `AI_CREATE_FIRST_TURN`；用 ref 防 StrictMode 双发。
- `onError`：把失败映射成可见说明「AI 辅助暂时不可用，请稍后重试或继续使用表单」，不 `message.error` 打断表单。

Wizard：

- 「AI 辅助」：`setAssistPaneCollapsed(false)` + `bootstrap()`。
- `useEffect`：`enabled` 且已有 `session` 时 `setContent(<AiCreateAssistChat ... />)`，cleanup `setContent(null)`。
- 删除 `AiCreateAssistDrawer`、`streamAiCreateAssistTurn`、`assistEvents` 状态。
- 继续跳过不可 persist 的 `flushDraft`；catch 后仍 bootstrap。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter web exec vitest run src/features/ai-assist src/features/departure/components/CreateDepartureWizard.test.tsx src/layouts/AssistPane.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit（仅当用户要求提交时）**

```bash
git commit -m "$(cat <<'EOF'
feat(发团): 新建发团右栏接入 CopilotKit 只读多轮对话

打开电子化助理后建立协助会话，用 CopilotChat 代替自研 Drawer；草稿仍只读，首轮只说明已填与缺失。
EOF
)"
```

---

### Task 4: 删旧路径并做切片验收

**Files:**
- Delete: `apps/web/src/features/departure/components/AiCreateAssistDrawer.tsx`
- Delete: `apps/web/src/features/departure/components/AiCreateAssistDrawer.test.tsx`
- Delete: `apps/web/src/features/departure/utils/ai-create-assist-stream.ts`
- Delete: `apps/web/src/features/departure/utils/ai-create-assist-stream.test.ts`
- Delete: `apps/agent/src/mastra-turn.ts`（若 Task 2 未删）
- Delete: `apps/agent/src/mastra-turn.spec.ts`
- Modify: 任何仍 import 上述文件的引用
- 不改：`assist-session` API、`getTaskContext`、Vite `/copilotkit` 代理、功能开关

**Interfaces:**
- Consumes: Task 1–3 已接线
- Produces: 仓库内无自研 `message.delta` 客户端；无 Ant Drawer 标题「AI 辅助建团」

- [ ] **Step 1: 搜索残留并补失败测试（若仍有引用）**

```bash
rg "AiCreateAssistDrawer|streamAiCreateAssistTurn|createMastraAssistStreamer" apps
```

Expected: 无业务引用。若测试还 mock `streamAiCreateAssistTurn`，改掉。

- [ ] **Step 2: 删除旧文件，跑相关测试**

Run:

```bash
pnpm --filter agent test
pnpm --filter web exec vitest run src/layouts src/features/ai-assist src/features/departure
pnpm --filter @xiaotuanbao/ai-contracts test
pnpm typecheck
```

Expected: PASS。若 diff 相对 `origin/main` 含 `apps/web/**`，再跑：

```bash
npx react-doctor@latest --verbose --scope changed
```

分数不回退。不要本地跑全量 API e2e。

- [ ] **Step 3: 手工冒烟清单（实现者在本地三进程核对）**

1. `pnpm dev:api`、`pnpm dev:web`、`pnpm dev:agent`；`.env` 已有 `AI_CREATE_ASSIST_ENABLED=true` 与 `DEEPSEEK_API_KEY`。
2. 发团列表 → 新建发团：默认无右栏内容区（收起）；中间是表单。
3. 点「AI 辅助」：右栏展开 480px，表单仍可点；不出现 `POST /api/ai-create-tasks/draft` 400。
4. CopilotChat 出现流式中文回复（已填/缺失）；可再输入第二句。
5. 选一条常用路线后再开助理：回复能提到该模板/路线，不要求再搜模板。
6. 关右栏、改团名、再开：编辑缓冲还在。
7. 停掉 Agent 再开：右栏失败说明可见，仍可「创建发团」。
8. 打开发团列表：右栏若展开，文案为「当前页尚未接入业务辅助」，无模型请求。

- [ ] **Step 4: Commit（仅当用户要求提交时）**

```bash
git commit -m "$(cat <<'EOF'
refactor(发团): 移除自研 AI 侧栏 SSE 与 Drawer

只读协助改走全局右栏与 CopilotKit，避免两套对话协议并存。
EOF
)"
```

---

## Spec coverage

| 规格条目 | 任务 |
| --- | --- |
| 三段式全局右栏、非浮层、无 mask | Task 1 |
| 其它页占位、不接模型 | Task 1、Task 3 只在建团注册 slot |
| Copilot Runtime + Mastra + 仅 getTaskContext | Task 2 |
| 委托 + task/run 头、模型不能改身份 | Task 2、Task 3 |
| 建团 CopilotChat 多轮、首轮固定文案 | Task 3 |
| 轻量 useCopilotReadable、草稿走工具 | Task 3 |
| 不完整草稿不 POST /draft | Task 3（沿用已有 persist 跳过） |
| 失败时表单可继续 | Task 3 |
| 删除自研 SSE/Drawer | Task 4 |
| 不做 HITL / Predictive Updates / 其它页对话产品化 | 全任务 YAGNI |

## 风险

- CopilotKit v2 的 `useCopilotChat` / `useAgent` / `createCopilotNodeHandler` 导出名以安装后的包为准；测试 mock 路径保持 `@copilotkit/react-core/v2`。
- Vite 必须把 `/copilotkit` 与 `/copilotkit/*` 都转到 4111（现有 proxy key `/copilotkit` 已覆盖前缀）。
- CopilotChat 自带样式，只进右栏；不要改全局 Ant Design token。
