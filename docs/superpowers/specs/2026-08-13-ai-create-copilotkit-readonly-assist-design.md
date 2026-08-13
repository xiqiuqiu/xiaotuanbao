# AI 建团只读协助：全局助理壳 + CopilotKit 接入

日期：2026-08-13
状态：已确认
关联：#297（父 #289），当前切片只读对话链路

## 1. 背景

#297 要求打通新建发团工作区的只读 AI 辅助：Web → CopilotKit + AG-UI → 独立 Mastra Agent → NestJS `getTaskContext`。当前实现用自研 SSE 冒充 `/copilotkit`，前端用 Ant Design Drawer 自绘消息，没有 Copilot Runtime，也没有多轮输入。

后续产品目标是工作台级电子化助理：能感知当前页并辅助任务，不只是一个聊天框。这一刀把**全局右栏壳**先铺上，但**只把建团页接到约定能力**；其它页不在本切片做业务辅助。

## 2. 范围

### 2.1 做

- 租户工作台三段式布局：左菜单（已有）· 中间当前页 · 右伸缩助理栏。右栏是全局壳，不是浮层，不盖住、不搬空中间表单。
- 右栏内部在建团页使用 CopilotKit `CopilotChat`（多轮、有输入框），不用 Ant Drawer 自绘消息，也不用 CopilotKit `CopilotSidebar` / `CopilotPopup`。
- `apps/agent` 改为 Copilot Runtime + Mastra，走 AG-UI；工具仍只有 `getTaskContext`。
- 建团页：打开右栏后创建/恢复协助会话，流式只读说明已填与缺失（含已选路线模板），并允许用户继续提问。
- 不完整草稿不走会校验失败的 `POST /ai-create-tasks/draft`；协助会话允许空草稿。

### 2.2 不做

- Predictive Updates、Human in the Loop、Generative UI 卡片、审核包、写草稿。
- `searchRouteTemplates`、资料上传、OCR、确认创建发团（后续票）。
- 其它业务页的页面上下文、专用工具、或「基本对话」产品化。其它页只保留右栏壳；展开时展示未接入说明，不接模型。
- 平台区（Platform Admin）布局。
- 把草稿或整页 DOM 做成 CopilotKit 业务对象。

## 3. 页面结构

```text
默认（两列，竖线从窗口顶到底）
├── 左 Sider          现有菜单，可折叠（自有顶区：品牌）
└── 中 Layout         自有顶栏（面包屑、用户）+ 当前页内容

展开助理后（三列，竖线仍从窗口顶到底）
├── 左 Sider
├── 中 Layout         顶栏变窄，仍只属于中间列
└── 右 AssistPane     自有顶栏（标题 + 关闭）+ 助理内容；约 480px
```

- 没有通栏顶栏。右栏展开时从窗口顶通到底，中间列（含其顶栏）变窄；收起后右栏宽度为 0，不留窄拉手。无 mask。
- 默认两列。从**中间列顶栏右侧**打开（「展开电子化助理」）；右栏自有顶栏的关闭按钮收起。新建发团的「AI 辅助」同样打开右栏并启动本页协助。
- CopilotKit Provider 与 `CopilotChat` 只在当前页注册了协助模块时挂载。本切片仅 `/departure/new` 注册。

## 4. 架构

```text
建团表单（Ant Design，权威编辑缓冲）
        │ 保存 / 协助会话
        ▼
NestJS  任务、草稿、权限、getTaskContext、短期委托
        ▲
        │ X-Agent-Service-Key + Bearer 委托
apps/agent  Copilot Runtime + Mastra Agent（唯一工具 getTaskContext）
        ▲
        │ AG-UI /copilotkit  Authorization: Bearer 委托
apps/web  MainLayout 右栏 → CopilotChat
```

分层不变：Web 不持有权威业务事实；Agent 不访问 Prisma、不写正式对象；契约在 `packages/ai-contracts`。CopilotKit 只做协作界面与 AG-UI 适配。

建团页用 `useCopilotReadable` 只暴露轻量协作状态（`aiCreateSharedLightStateSchema`：taskId、阶段、运行、版本、进度）。草稿正文只出现在 `getTaskContext` 返回值里。已选常用路线时，快照含 `mode=template`、`templateId`、`routeName`；Agent 据此说明「已选模板」，不新开搜模板工具。

## 5. 数据流

1. 用户在新建发团点「AI 辅助」或展开右栏。
2. 前端尽量 `flushDraft`；快照尚不满足 `saveDraft` 校验则跳过，不发 `POST /draft`。
3. `POST /api/ai-create-tasks/assist-session`（可带当前快照 / 已有 taskId）得到 `delegationToken`、`taskId`、`runId`、`agentRuntimeUrl`。
4. 挂载 `<CopilotKit runtimeUrl="/copilotkit" headers={{ Authorization: Bearer 委托 }} properties={{ taskId, runId }}>`，右栏渲染 `CopilotChat`。
5. 前端发送一条隐式首轮用户消息（固定文案：「请根据当前草稿说明已填写和仍缺少的信息，并只问一个下一步问题。」）。之后用户用 CopilotKit 输入框多轮对话。
6. Agent 每轮用委托调用 `getTaskContext`；模型只根据返回的 snapshot / fieldCoverage 回答。打开右栏只建一次协助会话，面板打开期间复用同一委托与 `runId`。再次打开会按现有逻辑结束仍在 `running` 的旧运行并开新会话；超时仍由现有运行保险丝收口。不新增单独的「关栏结束运行」接口。
7. 关闭右栏不结束 AI 建团任务，不丢表单编辑缓冲，不把聊天当业务事实写回草稿。

其它租户页：右栏可展开，内容为「当前页尚未接入业务辅助」，不请求 Runtime、不消耗模型。

## 6. 失败与权限

- 无 `departure:write` 或功能开关关闭：不显示「AI 辅助」，右栏不挂建团 Agent。
- 委托无效、Agent 不可用、模型超时/拒绝/格式错误：CopilotKit 对话区展示结构化失败（映射现有 `AiCollaborationError`），中间表单仍可保存和创建发团。
- `getTaskContext` 仍双重身份校验；失败不得改草稿版本或字段。
- 本切片 Agent 无提交候选、审核确认、正式写入工具；运行前后已保存草稿不变。

## 7. 测试

- 契约：轻量状态 strip、`getTaskContext` 仍只返回约定字段（含 template 路线已填判定）。
- Agent：Copilot Runtime 入口拒绝无委托；工具调用带 service key + 委托；无写工具。
- Web：三段布局右栏不遮罩表单；打开/关闭不丢编辑缓冲；空模板草稿不 POST `/draft`；建团页能完成只读多轮挂载；Agent 失败时仍可点「创建发团」。
- 现有只读 e2e：协助会话 + `getTaskContext` 双重身份保持。
- 不把固定模型措辞当断言。

## 8. 替换清单

- 删除：`AiCreateAssistDrawer` 自绘消息、`streamAiCreateAssistTurn` 自研 SSE 客户端、Agent 上假 AG-UI 的 JSON `{ taskId, runId }` 一轮流。
- 保留：`assist-session`、`getTaskContext`、功能开关、Vite `/copilotkit` → 4111、委托 JWT、service secret 留在 Agent。
