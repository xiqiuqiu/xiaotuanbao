# CopilotKit 会话内业务查询结果与分页交互核查

> 核查日期：2026-08-23  
> 项目版本：`@copilotkit/react-core@1.67.1`、`@copilotkit/runtime@1.67.1`  
> 范围：CopilotKit 官方文档、CopilotKit 官方安装包/源码、AG-UI 官方协议；结合小团宝当前受控会话实现判断适用性。

## 结论

CopilotKit **适合**在会话中呈现业务查询的结构化结果。官方把“将确定性工具调用映射成自定义 React 结果卡”定义为 Tool Rendering，也支持用 `useComponent` 展示卡片、图表和表格等 rich UI。[Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering) [Display-only Generative UI](https://docs.copilotkit.ai/generative-ui/your-components/display-only)

但这并不等于“聊天窗口适合承载完整业务列表和传统分页”。截至项目锁定的 1.67.1：

- CopilotKit v2 提供聊天壳、消息/Activity/Tool renderer、HITL、Interrupt、Threads 等原语；
- 没有面向任意业务结果集的 `Table`、`ListPagination` 或游标翻页组件；
- 安装包中可检索到的分页契约是 `useThreads` / `CopilotThreadsDrawer` 的**会话列表分页**，不能当成账款结果分页组件。[本地 v2 类型](../../apps/web/node_modules/@copilotkit/react-core/dist/v2/headless.d.mts#L599-L678)

因此，第二竖切推荐采用：

> **会话负责回答、摘要和少量结果预览；正式业务页面负责完整列表、筛选、排序与分页。**

合作伙伴往来账款查询应在聊天中显示一张紧凑的结构化结果卡：查询对象、查询时间、业务口径、应收/应付汇总、最多 3–5 条代表性或 User 明确请求的明细，以及“打开往来账款”入口。不要在聊天卡内实现页码、page size、跳页和连续加载多页。

## 一、当前项目的实际接入方式

项目声明并实际锁定 CopilotKit 1.67.1。[Web 依赖](../../apps/web/package.json#L15-L23) [Agent 依赖](../../apps/agent/package.json#L12-L18)

当前 AI 建团界面不是由浏览器直接运行 Agent，而是：

1. 服务端持久化 Conversation Event；
2. Web 将事件投影成受控消息；
3. `CopilotChatView` 接收 `messages / isRunning / inputValue / onSubmitMessage`；
4. `CopilotKit` 的 `renderActivityMessages` 渲染追问、审核包和搜索结果等结构化卡片。

代码已经使用 `ReactActivityMessageRenderer` 渲染服务端持久化的业务事件，例如审核包与线路搜索结果。[现有 Activity renderer](../../apps/web/src/features/ai-assist/AiCreateAssistChat.tsx#L414-L453) [CopilotKit Provider 接线](../../apps/web/src/features/ai-assist/AiCreateAssistChat.tsx#L910-L925)

这与 AG-UI 的 Activity Message 语义相符：Activity 是结构化、仅前端可见、不会再次发送给模型的消息，可用于自定义 UI，并可通过快照/增量恢复。[AG-UI Messages](https://docs.ag-ui.com/concepts/messages#activity-messages) [AG-UI Events](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx#activity-events)

所以对当前架构，**业务查询结果首选由小团宝持久化业务事件，再投影成 Activity Message，而不是强行改成浏览器侧 frontend tool**。Activity 只是 CopilotKit/AG-UI 的呈现信封，权威查询快照仍是带 `sourceActionId` 和版本的服务端事件。当未来真正打通 Agent → AG-UI tool-call stream 时，同一张结果卡可以再由 `useRenderTool` 按 Capability 名称映射为 Tool Rendering；两者只改变消息来源，不应改变业务结果组件和权限边界。

## 二、CopilotKit 官方模式分别适合什么

| 官方模式 | 官方定位 | 对账款查询的适用判断 |
|---|---|---|
| `useRenderTool` / Tool Rendering | 为已有后端工具调用按名称渲染状态、参数和最终结果 | **未来推荐**。适合 `partner.ledger.summary.read` 等真实后端 Capability；结果仍必须来自服务端工具结果，而不是模型自行编造 |
| `ReactActivityMessageRenderer` | 渲染结构化 Activity；AG-UI Activity 前端可见、可流式更新、可恢复 | **当前推荐**。最符合现有“PostgreSQL 事件 → 受控 CopilotChatView”的链路 |
| `useComponent` | 把 React 组件作为可被 Agent 调用的展示工具，参数直接成为组件 props | 可用于模型生成的图表/说明；**不宜作为权威账款事实来源**，因为 UI 参数来自 Agent 生成，而不是领域接口的受控结果 |
| `useFrontendTool` | 在浏览器执行工具逻辑，并可附带 inline renderer | 适合导航、读取浏览器状态等客户端能力；账款查询与权限校验应留在服务端，不应搬进浏览器 |
| `useHumanInTheLoop` | 暂停 Agent 执行，等待 User 确认、审批或填写表单后 `respond()` | **不用于分页**。查看下一页不是需要模型暂停等待的业务决策；当前项目的 durable HITL 也由服务端批次/交互状态负责 |
| A2UI / Open Generative UI | 由 Agent 生成声明式或开放式 UI | 首版不需要。账款卡的数据形状和交互已知，固定、版本化、可测试的 React/Ant Design 组件更合适 |

官方明确区分了两类 Generative UI：`useComponent` 是“组件本身就是工具，没有服务端执行”；Tool Rendering 则是“给真实后端工具调用包一层自定义 UI”。[Components as Tools](https://docs.copilotkit.ai/generative-ui/tool-based) [Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering)

账款金额属于权威业务事实，因此应走后者或当前的 Activity 投影，不能让模型通过 `useComponent` 参数重新表达完整数据集。

## 三、为什么不推荐在聊天卡内做传统分页

### 1. 官方提供的是渲染原语，不是业务数据工作台

`CopilotChatView` 的职责是组合可滚动消息区、输入区、建议项、欢迎页和自动滚动，并通过 Slots 允许替换局部视图。[CopilotChatView](https://docs.copilotkit.ai/reference/v2/components/CopilotChatView)

它允许在消息中放任意 React 组件，但框架没有替应用决定：

- 业务列表如何筛选、排序；
- page size 和游标如何保存；
- 多页数据如何与一条历史消息对应；
- 翻页后旧结果是否被改写；
- 权限撤销后哪些字段应隐藏。

这些仍是产品与业务数据层的职责。

### 2. 内嵌分页会破坏会话历史语义

历史消息应回答“当时查到了什么”。若 User 回看 90 天前的会话，而卡片内部页码实时请求最新数据，则同一条历史消息会同时混合旧汇总和新明细；若翻页直接替换卡片内容，又会失去当时可审计的结果。

AG-UI Activity 虽支持 `ActivityDelta` 更新进行中的活动，但这不意味着已完成的业务查询结果应该长期变成一个可变数据浏览器。Activity 的官方典型用途是进度、状态、步骤和搜索过程；完成后的业务快照仍应保持稳定。[AG-UI Messages](https://docs.ag-ui.com/concepts/messages#activity-messages)

### 3. 聊天宽度与数据密度不匹配

侧边栏模式宽度有限，账款明细通常还包含方向、来源、发团、到期日、约定、已核销、未结清和状态。把这些列压成卡片后继续分页，会形成“卡片中的小型工作台”，浏览效率和可比较性都弱于正式 Ant Design Table。

因此应让聊天回答“结论是什么、哪些对象值得关注”，让正式业务页面回答“完整数据有哪些、如何逐行操作”。

## 四、推荐的第一版结果呈现

### 4.1 会话结果卡

建议定义版本化 `partner-ledger-query-result@v1` Activity，内容由服务端生成并持久化：

```ts
type PartnerLedgerQueryResultV1 = {
  queryId: string
  queriedAt: string
  partner: { id: string; name: string }
  scope: {
    balanceScope: 'all_active' | 'open_only'
    departureDateFrom?: string
    departureDateTo?: string
    description: string
  }
  summary: {
    receivable: MoneySummary
    payable: MoneySummary
  }
  previewItems: LedgerPreviewItem[] // 服务端硬上限 3–5 条
  totalCount: number
  truncated: boolean
  sourceActionId: string
}
```

UI 只显示：

- Partner、查询时间和明确口径；
- 应收/应付的约定、已核销、未结清金额；
- User 明确要求明细时才显示最多 3–5 条预览；
- `共 N 条，仅展示前 M 条`；
- `打开往来账款`，携带 Partner 与筛选条件进入正式页面；
- `按当前条件刷新`，创建新的 InputBatch/Action/结果卡，不改写旧卡。

侧边栏和全局会话模式复用同一个 renderer；可以按容器宽度改变排版，但不要让全局模式变成另一套数据和交互语义。

### 4.2 User 继续追问

User 若说“只看应收”“把相关发团列出来”“现在还有多少未结清”，这是新的自然语言查询：

- 新建 InputBatch 和只读 Action；
- 服务端重新查询当前业务事实；
- 追加新的文本回答或结果卡；
- 不复用浏览器私有 cursor，也不在旧卡中悄悄翻页。

若 User 的真实意图是逐条浏览、筛选或核对全部账款，Agent 应提供进入正式业务页面的入口，而不是连续自动拉取多页。

如果后续真实使用数据证明必须在聊天内“再看几条”，可以在固定卡片中增加普通 UI 按钮，由前端调用受控服务端查询接口；这属于局部列表交互，不需要暂停 Agent、不调用 `respond()`，也不应伪装成新的 Agent 推理。首版不实现这一能力。

## 五、未来打通 AG-UI Tool Rendering 后的接法

当 `partner.ledger.summary.read` 和 `partner.ledger.items.read` 的 tool-call/result 真正通过 CopilotKit runtime 投影时，可以为各 Capability 注册 `useRenderTool`：

- `InProgress`：显示“正在核对合作伙伴账款”；
- `Executing`：显示受控加载状态；
- `Complete`：解析并校验 renderer 收到的字符串结果，再渲染同一个 `PartnerLedgerResultCard`；
- Tool 名必须与 Agent 暴露的名称一致，参数/结果由 schema 校验。

CopilotKit 1.67.1 已导出 `useRenderTool`、`useComponent`、`useHumanInTheLoop`、`ReactActivityMessageRenderer` 等 v2 API，[本地 v2 exports](../../apps/web/node_modules/@copilotkit/react-core/dist/v2/index.d.mts)；官方 Tool Rendering 也明确支持按工具名称绑定定制结果 UI，并提供通配 fallback。[Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering)

但 Tool renderer 只是展示层，不应：

- 在组件里重新执行未授权账款接口；
- 把模型给出的 Partner ID 当成已授权目标；
- 把 tool result 原始 JSON 全量塞入模型文本或 DOM；
- 用组件本地状态承担跨设备恢复和历史快照；
- 通过 `respond()` 把普通分页伪装成 HITL。

## 六、对第二竖切 Q6 的修正建议

原“首屏 10 条、服务端上限 20 条、会话内继续分页”的设计应改为：

> **Q6-A′：会话内呈现摘要与有限预览，不承载传统分页。**

1. 默认只返回文字概括和应收/应付汇总；User 明确要求明细时，结果卡最多预览 3–5 条。
2. 不在会话卡内提供页码、page size、跳页或“自动翻完”。
3. 明确展示 `共 N 条，仅展示 M 条`，并提供“打开往来账款”进入正式业务页面。
4. User 在会话中继续缩小范围或要求另一类明细时，作为新查询追加新结果，而非旧卡翻页。
5. 当前实现用持久化 Activity Message + `ReactActivityMessageRenderer`；未来 AG-UI tool call 打通后，复用同一卡片到 `useRenderTool`。
6. `useHumanInTheLoop` 只保留给需要暂停 Agent 等待确认/选择的流程，不用于普通列表浏览。[useHumanInTheLoop](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop)

这个方案既遵循 CopilotKit 的 generative UI 扩展方向，也保持小团宝既定职责：CopilotKit 承担会话与结构化呈现，Ant Design 业务页面承担高密度数据浏览和操作，服务端继续拥有权限、事实、查询口径与持久化。

## 资料来源

- CopilotKit：[Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering)
- CopilotKit：[useRenderTool](https://docs.copilotkit.ai/reference/hooks/useRenderTool)
- CopilotKit：[Components as Tools](https://docs.copilotkit.ai/generative-ui/tool-based)
- CopilotKit：[Display-only Generative UI](https://docs.copilotkit.ai/generative-ui/your-components/display-only)
- CopilotKit：[useComponent](https://docs.copilotkit.ai/reference/v2/hooks/useComponent)
- CopilotKit：[useFrontendTool](https://docs.copilotkit.ai/reference/hooks/useFrontendTool)
- CopilotKit：[useHumanInTheLoop](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop)
- CopilotKit：[CopilotChatView](https://docs.copilotkit.ai/reference/v2/components/CopilotChatView)
- CopilotKit：[useThreads](https://docs.copilotkit.ai/reference/v2/hooks/useThreads)
- CopilotKit：[CopilotThreadsDrawer](https://docs.copilotkit.ai/reference/components/CopilotThreadsDrawer)
- AG-UI：[Messages / Activity Messages](https://docs.ag-ui.com/concepts/messages#activity-messages)
- AG-UI：[Events / Activity Events](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx#activity-events)
- 本地 1.67.1 类型：[v2 API exports](../../apps/web/node_modules/@copilotkit/react-core/dist/v2/index.d.mts)、[Activity renderer contract](../../apps/web/node_modules/@copilotkit/react-core/dist/v2/context.d.mts#L43-L56)、[Threads pagination contract](../../apps/web/node_modules/@copilotkit/react-core/dist/v2/headless.d.mts#L599-L678)
