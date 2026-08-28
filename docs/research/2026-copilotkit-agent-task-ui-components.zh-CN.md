# CopilotKit Agent 任务交互组件与小团宝适配核查

> 核查日期：2026-08-27  
> 项目版本：`@copilotkit/react-core@1.67.1`、`@copilotkit/runtime@1.67.1`  
> 范围：CopilotKit 与 AG-UI 官方文档、CopilotKit 官方仓库/示例、本地安装包；重点核查任务进度、Tool Rendering、Generative UI、HITL、Shared State 和业务跳转。

## 结论

CopilotKit 有合适的 Agent 交互原语，但**没有开箱即用的通用“Agent 任务卡片”组件**。对小团宝当前架构，最合适的组合是：

1. 继续使用受控 `CopilotChatView` 作为会话壳；
2. 用 `ActivityMessage + ReactActivityMessageRenderer` 呈现持久任务、阶段进度、待补充和待审核卡；
3. 卡片内部继续使用 Ant Design，并由 React Router 执行业务深链；
4. PostgreSQL Conversation Event、Task、Interaction、Review Package 与后台 Worker 保持权威；
5. 将来真正接通 AG-UI Tool Call 后，再把同一业务卡片复用到 `useRenderTool`，无需改权威状态模型。

CopilotKit 官方的 Mastra Background Tasks 指南也采用 Activity renderer 在标准聊天时间线内显示实时任务卡，并明确通过 `renderActivityMessages` 注册；这正是小团宝目前的方向。[CopilotKit Background Tasks](https://docs.copilotkit.ai/mastra/background-tasks) AG-UI 则将 Activity 定义为结构化、可更新、可恢复且不会重新进入模型上下文的消息，适合步骤、清单和执行进度。[AG-UI Messages](https://docs.ag-ui.com/concepts/messages#activity-messages)

因此，本次缺失的根因不是“没采用 CopilotKit 任务组件”，而是此前**没有把持久任务状态完整投影为 CopilotKit Activity，并注册对应 renderer**。现在新增的 `agent-task` 与 `ai-create-review-package` renderer 属于正确修复路径。[当前 Activity renderer](../../apps/web/src/features/agent-conversation/AgentConversationChat.tsx#L55-L210) [持久事件投影](../../apps/web/src/features/ai-assist/ai-create-copilot-messages.ts#L365-L406)

## 能力适配总览

| CopilotKit 能力 | 官方定位 | 小团宝适配判断 |
|---|---|---|
| `CopilotChatView` | 受控聊天布局，接收 `messages / isRunning / inputValue / handlers`，并开放 Slots | **保留**。最适合“服务端事件 → 受控消息”架构 |
| `ReactActivityMessageRenderer` | 按 `activityType` 渲染结构化 Activity | **当前首选**。任务、进度、审核、追问均应走此路径 |
| `useRenderTool` | 按后端 Tool 名称渲染调用状态与结果 | **未来复用**。需先有真实 AG-UI Tool Call 流 |
| `useRenderToolCall` | 给自定义聊天面返回 Tool Call 渲染函数 | **不直接需要**。内置聊天消息视图已调用；它也不是 renderer 注册 API |
| `useComponent` | 让 Agent 通过工具参数实例化预注册 React 组件 | 不适合权威任务状态；适合低风险展示型 Generative UI |
| `useHumanInTheLoop` | 浏览器端工具暂停当前 Agent run，等待 `respond()` | 不承担持久审核；只可用于短暂、非权威的在线交互 |
| `useInterrupt` | 后端运行图在确定性节点暂停，由 UI 恢复 | 不替代 PostgreSQL HITL；可作为一次在线运行的体验增强 |
| `useAgent` / Shared State | 订阅并双向修改 AG-UI agent state | 可显示临时运行态，不作为 Task/Review 单一真相 |
| `useCoAgentStateRender` | v1 在聊天中渲染 CoAgent 状态 | 不建议新接。项目使用 v2，v2 推荐 `useAgent` 与普通 React 渲染 |
| A2UI / Open Generative UI | Agent 动态生成声明式 UI 或沙箱 UI | 固定业务任务卡不需要；首版增加复杂度与验证面 |
| Mastra Background Tasks | Mastra 后台任务生命周期映射为 Activity 卡 | 视觉模式可借鉴，不应替换现有 PostgreSQL Worker/Task 生命周期 |

## 一、`CopilotChatView` 与 Activity renderer 是当前最佳接缝

`CopilotChatView` 是布局型、受控组件：官方文档列出的核心数据属性包括 `messages`、`isRunning`、输入与提交/停止处理，并允许替换消息区、输入区、欢迎页等 Slots。[CopilotChatView](https://docs.copilotkit.ai/reference/v2/components/CopilotChatView)

当前项目已将 PostgreSQL 事件和即时输出投影为 `messages`，再把它们传入受控 `CopilotChatView`；输入和停止操作也调用小团宝服务端命令，而不是让浏览器直接拥有执行生命周期。[当前接线](../../apps/web/src/features/agent-conversation/AgentConversationChat.tsx#L628-L666) 这与既定的“CopilotKit 只负责交互投影，服务端控制面负责恢复和裁决”边界一致。[ADR-0046](../adr/0046-durable-ai-conversation-batches-and-context-projection.md) [ADR-0048](../adr/0048-conversation-first-agent-platform-and-framework-boundaries.md#框架与业务职责)

Activity 更适合任务卡，而不是普通 assistant 文本：

- `activityType` 可稳定绑定一个版本化 renderer；
- `content` 可保存 `taskId/status/title/reviewPackageId/fieldKeys` 等结构化字段；
- 相同消息 ID 可以投影最新状态；
- Activity 只服务 UI，不会把任务卡内容再次喂给模型；
- 刷新后可从 PostgreSQL Conversation Event 重建。

CopilotKit 的 Background Tasks 官方示例同样以 `mastra-background-task` Activity 显示 Working/Completed/Failed 卡片，并指出标准聊天界面会内联渲染注册的 Activity，无需另写消息列表。[Background Tasks：Activity card](https://docs.copilotkit.ai/mastra/background-tasks#render-the-activity-card-in-your-frontend)

### 推荐的任务 Activity 契约

不要只依赖当前较薄的 `{ taskId, title, status }`。建议后续将其版本化为 `agent-task@v1`，至少包含：

```ts
type AgentTaskActivityV1 = {
  version: 1
  taskId: string
  taskType: string
  title: string
  status:
    | 'queued'
    | 'running'
    | 'awaiting_user_input'
    | 'awaiting_review'
    | 'completed'
    | 'failed'
    | 'cancelled'
  stage?: { key: string; label: string }
  progress?: { completed: number; total: number }
  summary?: string
  destination?: { kind: 'departure_creation'; taskId: string }
  updatedAt: string
}
```

其中 `destination` 是**受控业务 locator**，不是任意 URL。前端按 `kind` 白名单映射到 TanStack Router；服务端不接受模型提供可执行链接，也不把权限声明放进 URL。

## 二、任务/进度卡：借鉴官方模式，但没有现成 TaskCard

CopilotKit 官方没有一个可直接导入的 `TaskCard` 或“任务中心”组件。官方提供的是三种底层表达：

1. **Activity**：最适合跨刷新任务、后台进度和阶段状态；
2. **Tool Rendering**：最适合展示某一次 Tool Call 的 InProgress/Executing/Complete；
3. **Shared State**：最适合让页面随 Agent 当前状态实时变化。

官方 Tool Rendering 文档明确将其用于反馈 Agent 正在调用什么工具，并允许按 Tool 名称定制 UI。[Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering) 官方 Shared State 示例则用 `useAgent()` 读取任务数组或步骤状态并让 React 响应更新。[Shared State](https://docs.copilotkit.ai/agent-spec/shared-state) 这些都是渲染原语，不规定业务任务生命周期、恢复、权限或审核模型。

小团宝应继续用 Ant Design `Card / Tag / Progress / Steps / Button` 实现视觉组件，把 CopilotKit Activity 作为消息信封。任务卡建议呈现：

- 标题与状态标签；
- 当前阶段与一行说明；
- 有可靠总量时才显示确定进度，无法量化时使用进行中状态；
- `待补充` 显示“在对话中回答”；
- `待审核` 显示摘要和主按钮“查看审核内容”；
- `完成/失败/停止` 保留历史结果和明确下一步；
- “查看任务”进入正式业务页面，不把复杂表单塞进窄栏卡片。

不要为了获得官方 Background Task 卡而把现有 Worker 改成 Mastra `BackgroundTaskManager`。官方方案的完成状态依赖 Mastra task manager、worker 与 AG-UI lifecycle 流；小团宝已有更强的 PostgreSQL lease、Attempt fencing、Interaction、Review Package 和跨设备恢复契约。[CopilotKit Background Tasks：completion](https://docs.copilotkit.ai/mastra/background-tasks#completion-is-out-of-band) 只需复用其 Activity 呈现模式，不应引入第二套任务真相。

## 三、Tool Rendering / Generative UI 的适用边界

### `useRenderTool`：未来有价值，当前不应强接

CopilotKit v2 的注册入口是 `useRenderTool`；它按 Tool 名称匹配，接收流式参数和 `InProgress / Executing / Complete` 状态，只负责渲染，不执行前端 handler。[useRenderTool](https://docs.copilotkit.ai/reference/hooks/useRenderTool)

`useRenderToolCall` 在 v2 是给自定义消息面调用的“renderer resolver”，不是用来注册任务组件；官方明确指出通常无需业务代码直接调用，注册 renderer 应使用 `useRenderTool`、`useFrontendTool` 或 Provider 配置。[useRenderToolCall](https://docs.copilotkit.ai/reference/v2/hooks/useRenderToolCall)

当前生产路径由 Worker 调用 Agent 后把最终结果写入 Conversation Event，浏览器没有收到完整的 AG-UI Tool Call/Tool Result 生命周期。因此现在把任务卡改成 `useRenderTool` 会丢失刷新恢复，或迫使系统维护两套来源。

未来若 `submitReviewPackage`、`searchRouteTemplates` 等 Tool Call 真正进入统一 AG-UI 流，可以：

- 将纯展示组件抽成 `AgentTaskCard`、`ReviewPackageCard`；
- 当前 Activity renderer 调用这些组件；
- `useRenderTool` 在 Tool 运行中也调用相同组件；
- Tool Call 只提供即时状态，最终仍由服务端持久事件裁决并重建。

### `useComponent`、A2UI 与 Open Generative UI：首版不采用

`useComponent` 会把预注册 React 组件作为前端工具交给 Agent，通过模型生成的参数渲染组件。[useComponent](https://docs.copilotkit.ai/reference/v2/hooks/useComponent) A2UI/Open Generative UI 更进一步，让 Agent 生成声明式 UI 或沙箱中的 HTML/JS；CopilotKit 官方示例仍通过 Activity renderer 承载这些输出。[CopilotKit OpenGenerativeUI](https://github.com/CopilotKit/OpenGenerativeUI/blob/main/docs/generative-ui.md)

小团宝的任务卡、审核卡和业务跳转结构固定，且包含权限、业务状态和审计要求。使用模型生成 UI 不会减少领域代码，反而扩大 schema、可访问性、主题一致性、URL 安全和回归测试范围。因此不建议为这次缺口引入 A2UI/Open Generative UI。

## 四、HITL：适合在线暂停，不适合作为审核权威

`useHumanInTheLoop` 注册一个前端交互工具：当模型调用它时，当前 run 暂停，UI 获得 `respond()`，调用后该结果作为 Tool Result 让运行继续。官方推荐它用于确认、审批和表单收集。[useHumanInTheLoop](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop)

但这类暂停依赖当前 CopilotKit/Agent run 的工具生命周期。小团宝的审核可能跨刷新、关闭侧栏、换设备和较长时间等待，还要处理权限撤销、对象版本冲突、幂等和审计，因此不能由 `respond()` 或客户端组件状态担任可靠性边界。项目 ADR 已明确：Review Package 是服务端事实源，后台工作流根据表单处置推进；CopilotKit HITL 不能取代这套控制面。[ADR-0043](../adr/0043-ai-review-confirmation-on-form-not-chat.md#L5-L13)

推荐分层：

- 会话中的待审核卡：普通 Activity renderer；
- “查看审核内容”：业务导航；
- 表单确认/拒绝：服务端审核命令；
- Conversation Event：记录处置并驱动卡片变更；
- 若当前在线 run 仍存在，可把处置通知给它作为体验优化，但不依赖该通知完成业务恢复。

`useHumanInTheLoop` 可保留给不需要跨会话持久化的短交互，例如一次临时展示偏好选择；凡是任务状态、审核、写操作确认或开放问题，都继续使用 PostgreSQL Interaction/Review Package。

## 五、Shared State：可做即时投影，不做双主

CopilotKit v2 推荐通过 `useAgent()` 订阅 `agent.state`，状态变化会触发 React 更新；同一 hook 也允许前端 `setState()`。[useAgent](https://docs.copilotkit.ai/reference/v2/hooks/useAgent) [Shared State](https://docs.copilotkit.ai/agent-spec/shared-state)

旧版 `useCoAgentStateRender` 的官方定位确实是“在聊天中显示中间状态或进度”，但它属于 v1 API。[useCoAgentStateRender](https://docs.copilotkit.ai/reference/v1/hooks/useCoAgentStateRender) 当前项目使用 `@copilotkit/react-core/v2`，本地 v2 导出也没有 `useCoAgentStateRender`；不应为了这个 hook 混用 v1/v2。

即便采用 v2 Shared State，也只适合：

- 当前在线 Attempt 的临时步骤；
- 可以丢失并由服务端重建的加载提示；
- 不涉及业务裁决的页面联动。

Task 状态、审核状态、用户回答和完成结果继续从 PostgreSQL Conversation Event 投影。否则 `agent.state` 与数据库状态会形成双主，刷新或迟到事件时无法确定谁覆盖谁。

## 六、消息内业务跳转

CopilotKit 没有专门的“业务路由卡片”组件，也不需要为普通点击注册 `useFrontendTool`。Activity/Tool renderer 返回标准 React 元素，因此可直接渲染 Ant Design `Button` 或 Router `Link`；官方 Tool Rendering 与 HITL 示例都在 render 中使用普通 React 交互元素。[Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering) [useHumanInTheLoop](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop)

当前实现已在 renderer 中用 `useNavigate()` 打开 `/departure/new?taskId=...`，并在全局 Agent 模式先恢复侧边栏语义，属于正确做法。[当前任务跳转](../../apps/web/src/features/agent-conversation/AgentConversationChat.tsx#L541-L555)

建议把该逻辑泛化为统一的 `openAgentDestination(locator)`：

- 只接受版本化、白名单 `kind + id + stable filters`；
- 侧边栏模式只切换业务路由并保持当前 Conversation；
- 全局模式退出全局页，进入业务路由并恢复同一 Conversation；
- 目标页面重新鉴权、重新读取当前业务事实；
- 不接受模型生成的完整 URL，不在 URL 中携带候选字段、金额、权限或审核结果。

如果未来需要“Agent 主动打开页面”，才考虑 `useFrontendTool` 注册受控导航工具；用户点击卡片按钮本身只是普通产品交互，不应再触发一次模型或 Tool Call。

## 七、实现建议与优先级

### P0：保持现有架构，完善任务 Activity

1. 保留受控 `CopilotChatView + renderActivityMessages`。
2. 将任务 Activity 内容版本化，覆盖排队、运行、待补充、待审核、完成、失败、取消。
3. 同一 `taskId` 使用稳定消息 ID，使状态更新原位替换；同时保留必要历史阶段事件用于审计。
4. Review Package 卡继续独立于 Task 卡，避免任务状态和具体审核内容耦合。
5. 为刷新、SSE 重连、历史会话和跨设备恢复增加 renderer 回归测试。

### P1：抽取可复用业务卡与导航

1. 抽出 `AgentTaskCard`、`ReviewPackageCard`，renderer 只做 schema 校验和 props 映射。
2. 抽出 `AgentDestination` 白名单与统一导航函数。
3. 卡片按侧边栏/全局宽度响应式排版，但保持同一状态和动作语义。

### P2：接通真实 Tool Call 后再复用 `useRenderTool`

1. 只为需要展示执行细节的 Tool 注册 named renderer；
2. 即时 Tool 状态可短暂显示，但最终状态由持久 Conversation Event 覆盖；
3. 不用 Tool renderer 承担业务查询、审核命令或跨刷新恢复。

### 暂不采用

- 不迁移到 `CopilotSidebar`：项目已有统一侧栏/全局双视图，换壳不能补足任务事实；
- 不混用 v1 `useCoAgentStateRender`；
- 不用 `useHumanInTheLoop/respond()` 取代持久审核；
- 不为固定任务卡引入 A2UI/Open Generative UI；
- 不为获得 Background Task UI 替换 PostgreSQL Worker。

## 八、版本注意事项

CopilotKit 1.64.1 曾有一个对象型 Activity 更新冻结问题：`CopilotChat` 的 message fingerprint 没有纳入对象内容变化，导致相同消息 ID 的进度快照可能不重渲染。[CopilotKit #6327](https://github.com/CopilotKit/CopilotKit/issues/6327) 对应提议修复的 [PR #6412](https://github.com/CopilotKit/CopilotKit/pull/6412) 已关闭但未合并；issue 随后以 completed 关闭。

本地安装的 1.67.1 已在 `CopilotChat` fingerprint 中对对象内容使用 `JSON.stringify(m.content)`，说明发布包已通过其他变更路径包含等价修正。[本地 1.67.1 实现](../../node_modules/.pnpm/node_modules/@copilotkit/react-core/dist/copilotkit-DMmUbvpo.mjs#L8611) 同时，小团宝直接把每次重建的新 `messages` 数组传给受控 `CopilotChatView`，本来就不经过该 issue 描述的 `CopilotChat` memo 路径。

结论是：当前接法已规避旧问题，但仍应保留“同一 taskId 内容变化后卡片更新”的回归测试；未来若切回高层 `CopilotChat` 或升级 CopilotKit，应重新实测对象型 Activity 更新。

## 最终建议

本次任务卡与审核跳转不需要另找 CopilotKit 的“更高级组件”。**当前新增的 Activity renderer 就是 CopilotKit 官方最贴合该场景的扩展点。** 真正值得继续做的是把它从一次补丁提升为稳定的 Agent UI 投影层：版本化 Activity 契约、统一任务状态、可复用 Ant Design 卡片、受控业务 locator、跨刷新测试，以及未来与 `useRenderTool` 的组件复用。

这既能获得 CopilotKit 的会话内结构化 UI 能力，又不会削弱小团宝现有 PostgreSQL HITL、权限、审计和业务恢复边界。

## 官方资料

- CopilotKit：[v2 API Reference](https://docs.copilotkit.ai/reference/v2)
- CopilotKit：[CopilotChatView](https://docs.copilotkit.ai/reference/v2/components/CopilotChatView)
- CopilotKit：[Background Tasks](https://docs.copilotkit.ai/mastra/background-tasks)
- CopilotKit：[Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering)
- CopilotKit：[useRenderTool](https://docs.copilotkit.ai/reference/hooks/useRenderTool)
- CopilotKit：[useRenderToolCall](https://docs.copilotkit.ai/reference/v2/hooks/useRenderToolCall)
- CopilotKit：[useComponent](https://docs.copilotkit.ai/reference/v2/hooks/useComponent)
- CopilotKit：[useHumanInTheLoop](https://docs.copilotkit.ai/reference/v2/hooks/useHumanInTheLoop)
- CopilotKit：[Human-in-the-Loop patterns](https://docs.copilotkit.ai/agent-spec/human-in-the-loop)
- CopilotKit：[Shared State](https://docs.copilotkit.ai/agent-spec/shared-state)
- CopilotKit：[useAgent](https://docs.copilotkit.ai/reference/v2/hooks/useAgent)
- CopilotKit：[useCoAgentStateRender（v1）](https://docs.copilotkit.ai/reference/v1/hooks/useCoAgentStateRender)
- CopilotKit 官方仓库：[OpenGenerativeUI](https://github.com/CopilotKit/OpenGenerativeUI/blob/main/docs/generative-ui.md)
- AG-UI：[Activity Messages](https://docs.ag-ui.com/concepts/messages#activity-messages)
- AG-UI：[JS Types / ActivityMessage](https://docs.ag-ui.com/sdk/js/core/types#activitymessage)
- CopilotKit 官方仓库：[Activity 对象更新问题 #6327](https://github.com/CopilotKit/CopilotKit/issues/6327)、[未合并修复 PR #6412](https://github.com/CopilotKit/CopilotKit/pull/6412)

## 本地版本证据

- 依赖版本：[apps/web/package.json](../../apps/web/package.json)、[apps/agent/package.json](../../apps/agent/package.json)
- v2 Provider 支持 `renderActivityMessages`：[本地 v2 类型](../../node_modules/.pnpm/node_modules/@copilotkit/react-core/dist/v2/context.d.mts)
- v2 导出 `CopilotChatView / ReactActivityMessageRenderer / useRenderTool / useHumanInTheLoop / useAgent`，未导出 `useCoAgentStateRender`：[本地 v2 exports](../../node_modules/.pnpm/node_modules/@copilotkit/react-core/dist/v2/index.d.mts)
- 当前任务和审核 renderer：[AgentConversationChat.tsx](../../apps/web/src/features/agent-conversation/AgentConversationChat.tsx#L55-L210)
- 当前受控聊天接线：[AgentConversationChat.tsx](../../apps/web/src/features/agent-conversation/AgentConversationChat.tsx#L628-L666)
- 当前持久事件到 Activity 的投影：[ai-create-copilot-messages.ts](../../apps/web/src/features/ai-assist/ai-create-copilot-messages.ts#L365-L470)
