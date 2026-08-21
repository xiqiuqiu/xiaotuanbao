# DeepSeek Harness 用于小团宝 Agent 底层重构的架构评审

> 研究日期：2026-08-20  
> 官方源码快照：DeepSeek Harness [`141eb6fef83422698aef7a981029e843e8161534`](https://github.com/deepseek-ai/deepseek-harness/tree/141eb6fef83422698aef7a981029e843e8161534)（`dsh@0.1.0-rc.8`，提交于 2026-08-19）  
> 范围：只使用 DeepSeek 官方仓库的源码和文档作为 Harness 事实依据，再与本仓库当前实现逐项对照。本文区分“官方实现事实”和“对小团宝的架构判断”。

## 结论

DeepSeek Harness 值得作为重构候选，而且候选范围应当比“替换 Mastra executor”更大：它已经提供了成熟得多的 Agent 内核，包括事件溯源 transcript、可重建模型请求、持久 inbox、`followup` / `steer` / `inject`、取消收敛、上下文压缩、受控工具流水线、审批、沙箱、后台 job、可续跑 subagent、插件化组合，以及 TypeScript / Python SDK。

但它目前**不能原样替换小团宝的全部服务端执行控制面**。决定性差异不是功能多少，而是可靠性和权威边界：

- Harness 默认会话持久化只承诺**一个 session 同时一个 live writer**；本地 job 明确是进程内状态。
- 崩溃恢复会保留已落盘事件并关闭中断 turn，但不会从中断步骤继续执行。
- SDK wire 目前只有 `initialize`、`session/prompt`、`shutdown`，没有单 session / 单 prompt 的 cancel、close、steer、inject 或结果归属协议。
- `ask_user_question` 和工具 approval 都是在一个仍然存活的 turn 内等待 Promise；它们不是跨进程、跨刷新、可 CAS 处置的持久 HITL。
- Harness 能重建“模型实际看到的消息、system prompt、tool schemas 和调用配置”，但没有小团宝 `Context Manifest` 的业务版本证据：资料解析版本、摘录 digest、业务草稿版本、Organization/User 权限快照等。

因此建议的目标不是“Mastra adapter + Harness adapter 并排”，也不是“把小团宝会话全删掉”，而是：

> **用 DeepSeek Harness 替换 Agent 内核与技术 transcript；保留 PostgreSQL 业务工作流和领域事实，把小团宝已有能力改造成 Harness 的插件、持久化适配器和宿主协议。**

更具体地说，第一阶段可替换 Mastra、模型循环、工具注册/执行、技术上下文派生和运行内取消；第一阶段不可删除 `AiInputBatch`、`AiWorkflowJob`、`AiAgentAttempt`、`AiContextManifest`、持久审核包/追问、组织权限复查和业务动作网关。

## 一、Harness 的真实架构边界

官方把 model adapter、tool registry、session log、agent loop 都实现为 Cordis plugin；profile 是 bundle 和用户 patch 的命名组合，bundle 是插件配置行的分发单元。`web` 和 `headless` 只是两套模板，并不存在不可替换的 privileged core。[官方架构](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/architecture.md#L7-L30)

这意味着小团宝可以有三种接入深度：

1. **CLI headless 外挂**：调用官方 `headless` profile，一次任务、一次新 Agent、stdout 收尾。
2. **SDK 子进程**：通过 stdio JSON-RPC 驱动一个长期存活的 runtime，按 session id 多轮发送。
3. **自定义 Cordis composition**：在 Node 进程内或专用 Agent 服务内组装 Session、Agent Loop、Tools、Persistence、LLM 和小团宝插件。

对本项目而言，1 只适合冒烟 PoC，2 适合验证运行时能力，3 才是长期候选。原因是官方 headless runner 每次创建随机 session，只提交一个普通 user message，等待 `whenIdle()`，flush 后输出最后一条 assistant 文本并退出；官方也明确写出“one submitted task only”和“no interactive follow-up surface”。[headless 源码](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/bundle/headless/src/index.ts#L90-L149) [headless 说明](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/bundle/headless/README.md)

### SDK 的能力与缺口

官方已经提供 Python SDK 和对应的 stdio JSON-RPC runtime，不应再把 Harness 误判为只能跑 CLI。SDK 可复用同一 runtime 子进程、复用命名 session，并通过通知观察 root 与已发现 subagent 后代的 session events/status。[Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/python/sdk/README.md) [教程](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/user/guide/python-sdk.md)

但当前 wire 协议只有三个请求：

- `initialize`
- `session/prompt`，返回持久 inbox 的 `messageId`
- `shutdown`

通知只有 `session.event`、`session.status`、`subagent.started`、`subagent.finished`。[SDK protocol 源码](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/sdk/protocol/src/types.ts#L92-L105)

`Session.run()` 的结果边界是“该 prompt 被 inbox 接受后，直到整个 Agent 下一次 idle”；官方明确说明期间的 steering、inject 或其他排队工作都可能参与，`final_response` 并不严格因果归属于这条 prompt。[Python SDK API](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/python/sdk/src/deepseek_harness/api.py#L127-L183)

这与小团宝当前“一次 `attemptId` 对应一个确定 `HeadlessExecutionResult`”的约束不同。如果直接使用 SDK，必须在自定义协议中补齐 attempt correlation、单运行取消、结构化 outcome 和所有权 fencing；不能把 `whenIdle()` 当作业务 attempt 的天然完成证明。

## 二、Session、Event Log 与 Context Derivation

### 官方实现事实

Harness 的 `Session` 是 typed `SessionEvent` 的 append-only log，是一次 Agent 交互的单一事实源；LLM message history 由 `deriveMessages()` 从 log 投影，而不是另存一份 messages。核心事件包括 turn/step 边界、user/assistant message、原始 assistant chunk、tool call/result、request header 和 inbox mutation；插件还可通过 declaration merging 增加事件。[Session 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/session.md) [Session 类型源码](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/core/session/src/types.ts)

它比普通聊天记录强的地方有四点：

1. 原始 `assistant/chunk` 与组装后的 `assistant/message` 同时存在，既可流式重放，又有完成锚点。
2. `sourceEventSeqs` 保留 assistant/message、工具结果与被替换 surface 节点之间的来源关系。
3. `request/header` 记录当次请求完整的模型配置、system prompt 和 tool schemas；运行时不变量会从 log 独立重建实际请求。
4. “model-visible means logged”：进入模型请求的内容必须能由 log 重建。[架构中的 session log 原则](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/architecture.md#L75-L78) [Agent Loop 重建约束](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/core/agent-loop/README.md#request-reconstruction)

Compaction 也不是就地篡改旧消息：`compaction/start` / `summary` / `end` 记录压缩事务和被 shadow 的 seq，摘要通过新的 surface replacement `user/message` 替换一段可见历史，旧日志仍可审计。[Compaction 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/compaction.md)

### 对小团宝的判断

Harness Session 足以替换当前 Mastra 内部不可见的模型 transcript，并能显著增强调试、重放、流式 UI、工具审计和 compaction；也可以承载“小团宝 Agent 技术会话”的底层记录。

但它不能直接等同于当前 `AiConversationEvent`：小团宝事件同时是产品状态和业务工作流投影，包含 batch status、审核包引用、持久交互及跨设备恢复；其 sequence 还参与 `conversationVersion` 冻结。当前模型见 [Prisma schema](../../apps/api/prisma/schema.prisma) 中的 `AiConversation`、`AiConversationEvent` 和 `AiInputBatch`。

可行的长期形态有两种：

- **双日志、显式关联（近期推荐）**：`AiConversationEvent` 继续保存产品/业务事件；Harness Session 保存模型与工具 transcript；用 `conversationId + inputBatchId + attemptId + contextManifestId` 关联。
- **统一事件底座（后期可评估）**：实现 PostgreSQL `SessionPersistence` 和小团宝扩展 `SessionEventMap`，让业务事件进入同一 append-only log，再由独立 projection 构建产品视图。但这要求先解决多进程 writer fencing、租约、事务联动、组织隔离和数据迁移，不能作为第一刀。

### Context Manifest 不能被 request/header 取代

Harness 的 `request/header` 很有价值：它证明使用了哪个 provider/model、system prompt 和 tool schema；session surface 能证明模型看见了哪些消息。它可以替换小团宝 Manifest 中 `systemPromptVersion` / `toolSchemaVersion` 这类粗粒度版本号，升级为“当次实际值”。

但当前小团宝 `AiContextManifest` 还记录：

- `conversationVersion` 与实际 event sequences；
- `materialId + parseResultVersion`；
- 每段摘录 SHA-256；
- 草稿 `businessSnapshotVersion`；
- builder/model 版本、裁剪原因与最终 `inputHash`。

这些由 [ai-context-manifest.ts](../../apps/api/src/modules/ai-create-task/ai-context-manifest.ts) 和 [ai-workflow.processor.ts](../../apps/api/src/modules/ai-create-task/ai-workflow.processor.ts) 在 attempt 前冻结。Harness 不知道业务数据库对象、资料解析版本或权限事实，因此最多成为 Manifest 的更精确**执行侧证据源**，不能删除 Manifest。推荐把 `harnessSessionId`、首尾 event seq、`request/header` hash 加入 Manifest/attempt 关联，而不是反过来删除业务证据。

## 三、Agent Loop、Inbox 与运行控制

### 官方实现事实

一个 step 是一次模型请求加其工具调用，一个 turn 包含零到多个 step。Driver 在 turn 开始时从 inbox 认领 next-step 输入与一个 queued message，运行 `agent/pre-step`，组装 prompt/tool schemas，从 session log 派生 history，流式请求模型，执行工具；若工具或 steering 要求继续则进入下一 step，直到 turn 停止。[Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/architecture.md#L50-L74) [生命周期图](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/agent-lifecycle.md)

Agent 只有一个 inbox，但有两个有序分区：`next-turn` 和 `next-step`。每次 append/prepend/replace/remove/clear/splice/claim 都记录 durable `agent/inbox/spliced`；`MessageId` 是 pending 消息身份。[Core 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/core.md#the-agent-handle)

四种输入/控制语义是：

| API | 语义 |
|---|---|
| `followup(message)` | 排入下一个普通 turn 并唤醒；一个消息独占自己的 ordinary turn |
| `steer(message)` | 排入最近的 next-step；空闲时新开 turn，运行中在下一个 step 边界消费 |
| `inject(message)` | 排入 next-step context 但不唤醒；可能错过已经完成 claim 的请求 |
| `cancel(cause, { keepInbox? })` | 中止当前 driver；默认同时清掉 pending inbox，`keepInbox` 可保留未开始工作 |

`followup()` 不返回某次结果句柄；`whenIdle()` 观察整个 Agent 的 quiescence，不证明某条消息如何结束。官方对此有明确警告。[Agent README](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/core/agent/README.md#the-agent-handle)

### 对小团宝的判断

这套 Agent Loop 可以完整替换 Mastra 的 `generate()` 循环，并能改进：

- 多 step 工具调用及结果配对；
- 用户追加消息、运行中引导、系统事实注入的明确时序；
- 真正向模型/工具传播 `AbortSignal`，而不是只在数据库把批次标为 cancelled；
- 失败请求拦截与 compaction 后 retry；
- 全事件流 UI，而不只是最终 `text/toolCalls` 抽取。

但 inbox 不能自动替换 `AiInputBatch`。Harness inbox 是**一个 live Agent 的执行队列投影**；`AiInputBatch` 是产品级不可变输入、附件齐套屏障、`replyToEventId`、conversation snapshot 和跨 Worker 恢复对象。最安全的映射是：Worker 认领一个 ready batch 后，才把已冻结 projection 作为一条 identified Harness message 投入 inbox；不要允许 Harness 自己从产品的未冻结草稿或仍在解析的附件中组装输入。

取消也需双向接通：User `stopBatch` 先通过 PostgreSQL CAS/租约撤销业务所有权，再通过 runtime protocol 对对应 Agent/attempt 发 `cancel({kind:'user'})`。单独调用 Harness cancel 不足以阻止失去租约的旧 Worker 写回；单独改 DB 也无法及时停止模型计费和工具执行。

“resume”应区分两件事：

- `ctx.agents.resume({ resumeSessionId })`：加载一个已持久化、已平衡或经 crash repair 平衡的 session，继续新的 turn。
- 中断中的模型请求/工具步骤续跑：官方没有实现。崩溃恢复会给孤儿 turn 追加 synthetic interruption closers，而不是从中间继续。[Persistence crash recovery](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/persistence.md#crash-recovery-preserves-an-interrupted-turn)

因此小团宝 attempt 重试仍需由 Workflow Worker 创建新的 attempt，并通过业务幂等边界防止重复副作用。

## 四、Tools、Permission、Approval、Sandbox、Jobs 与 Subagents

### Tool Registry 与执行流水线

`ctx.tools` 是 scoped registry，模型 schema 只从显式 allowlist 投影；执行前会冻结并校验 JSON 参数，再经过 `tools/pre-execute`、monotonic guards、`tools/execute` wrapper、`tools/post-execute` 和结果观察。Pre-policy 可 `allow` / `deny` / `ask`；缺少 approval service、无 Agent 或非 `allowed-once` 都 fail closed。Guard 只能进一步拒绝，后监听器不能把已拒绝动作重新放开。[Tools 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/tools.md)

这一层应替换当前 Mastra `createTool()` 和 `toolCalls` 事后扫描，但不能成为业务授权最终层。小团宝的 `getTaskContext`、`getMaterialParseResult`、`searchRouteTemplates`、`submitReviewPackage` 可以注册为 Harness tools；工具 body 继续调用小团宝 API/AI Action Gateway。Organization、User、业务对象版本和风险决策仍由 API 端解析，不信任 Agent 进程内身份。

### Approval 与业务审核不是同一概念

Harness approval 是“这一次具体 tool action 能否继续”：只有 `allowed-once` 放行；`rejected`、`cancelled`、`unavailable` 全部拒绝；每次 ask/decision 作为 log-only pair 记录，且请求必须发生在 open turn 内。[Approval 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/approval.md)

这适合 shell、文件写入或危险工具的即时授权，不等于小团宝审核包：

- Harness approval 绑定 live turn/tool call；小团宝审核包绑定业务候选和表单版本。
- Harness 是 one-shot grant；小团宝需要修改候选、确认、拒绝、版本冲突、首个处置生效和刷新后继续。
- Harness log 不会把 `allowed-once` 自动转化为领域写入或业务幂等键。

因此 Harness approval 可作为外层执行安全能力，但不能替代 ADR-0043 的表单审核和 ADR-0047 的动作网关。

### User Questions 不是持久 HITL

官方 `ask_user_question` 支持批量问题、选项、多选和自定义回答，但工具调用会一直等待 UI provider 的 Promise；没有 provider 就报 `NO_PROVIDER`，取消依赖当前 turn 的 signal。官方明确列出“pending question blocks the tool call until the human answers”。[Ask User Tool](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/interaction/tool-ask-user/README.md) [User Questions Service](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/interaction/user-questions/README.md)

这不能原样替换 `AiConversationInteraction`：后者是 PostgreSQL pending object，响应使用 version CAS，关页、API/Worker 重启后仍能回答，并用新 `AiInputBatch.replyToEventId` 进入后续 attempt。要复用 Harness 的 question schema，应该写一个“小团宝 durable question adapter”：遇到 question 时结束当前 attempt 为 `awaiting_user_input`，持久化结构化问题；User 回答后由新 attempt 把回答作为 followup 输入，而不是让 Agent 进程跨小时悬挂 Promise。

### Sandbox 与 Permission Presets

Harness sandbox 约束的是 subprocess 的**文件效果**：`read-only`、`workspace-write`、`danger-full-access`；网络和进程可见性明确不在该词汇中。后端可报告 `full` 或 `partial` enforcement，要求绝对边界的调用方必须拒绝 partial。[Sandbox 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/sandbox.md)

Permission preset 只是把 sandbox mode 与 approval policy 组合成 UI 选择，本身不执行授权。[Permission Presets](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/permission-presets.md)

小团宝当前四个业务工具不需要文件/子进程权限，因此 sandbox 不是接入前置；未来启用代码执行、OCR 后处理或本地文件工具时可直接复用。但网络出口、数据库/HTTP 目标白名单、Organization 权限仍需另行限制。

### Jobs

Job seam 的抽象很完整：owner-scoped 访问、并发配额、start/read/wait/kill、settlement first-wins、owner dispose 清理和 completion notifications。但官方默认 `dsh-jobs-local` 明确写明“Jobs are process-local — records die with the harness process；durable or cross-restart execution needs a separate backend”。[Jobs 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/jobs.md) [Local Jobs 限制](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/jobs/jobs-local/README.md#known-limitations-and-deferred-work)

所以它不能替换 `AiWorkflowJob` 和 Workflow Worker。它可以用于一个 attempt 内的后台 shell/subagent，并把结果归入 Harness transcript；跨重启、租约回收、附件屏障、失败重试仍由 PostgreSQL Worker 负责。若未来实现 PostgreSQL `JobRegistry`，也必须先定义它与 `AiWorkflowJob` 是同一权威还是不同层次，不能形成两套 durable job。

### Subagents

Harness 的 subagent 是真正的 capability family：支持 fresh spawn、从父已完成历史 fork、ACP/Codex/Claude Code/DSH SDK provider、tool filtering、persona、深度限制、结构化输出；continuable child 以 durable child Session 为身份，可在没有 live Activation 时 cold-resume，followup 使用 child inbox FIFO。[Subagent 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/subagent.md)

但 Activation 与 parent/child ownership 是进程内的；final settlement 的 flush 失败只记录日志，仍会释放 Activation，后续持久 child 可能缺失或陈旧。`interrupt` 只中断当前 turn 并保留 inbox，不撤销产品业务动作。

它适合以后把“资料分析、路线检索、候选校验”等拆成有界并行工作，但第一阶段不应让 subagent 直接获得业务写工具；child 只能返回候选/证据，所有业务 proposal 仍经父 Agent 和 Action Gateway。

## 五、Persistence、数据库与多进程能力

### 官方已有能力

`SessionPersistence` 是抽象 seam，官方有：

- JSONL：每 session 一个 append-only logical log，默认 Zstandard frame，支持 checksum、原子写、torn-tail 处理和 crash repair。
- SQLite：schema 17，物理压缩 chunk rows，逻辑上恢复完全相同的 `SessionEvent[]`，WAL + `synchronous=FULL`。

共同 coordinator 负责 per-id write serialization、flush、prepare/inspect cache、revisions 和 repair。[Persistence 文档](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/docs/subsystems/persistence.md) [SQLite provider](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/session/session-persistence-sqlite/README.md)

### 必须正视的限制

1. JSONL 官方明确要求 **one live writer per session**；另一个 backend instance/process 在 owner quiescent disposal 前不得写同一 session。[JSONL 限制](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/session/session-persistence-jsonl/README.md#known-limitations-and-deferred-work)
2. Shared coordinator 的 revision freshness check 不提供 cross-process writer exclusion；持续外部写者甚至可能让 load/inspect/prepare 延迟收敛。[Persistence coordinator](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/session/session-persistence/README.md#the-write-coordinator)
3. SQLite provider 是 pre-release interim design，无 schema migration 保证；`DatabaseSync` 与 busy waits 会阻塞 event loop。[SQLite 限制](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/session/session-persistence-sqlite/README.md#known-limitations-and-deferred-work)
4. Full-text derived index 更明确要求一个 path 只能由一个进程中的一个 service 拥有，外部写者和多进程共享不支持。[Session Query SQLite](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/packages/session-query/session-query-sqlite/README.md#known-limitations-and-deferred-work)
5. 官方没有 PostgreSQL SessionPersistence，也没有与业务事务一起提交 session event + review package 的 backend。

小团宝当前 Worker 用 PostgreSQL `FOR UPDATE ... SKIP LOCKED`、租约、heartbeat、attempt、重试与事务写回，明确支持多个 Worker 抢占和过期回收；见 [ai-workflow.processor.ts](../../apps/api/src/modules/ai-create-task/ai-workflow.processor.ts)。这套能力不能被本地 JSONL/SQLite 或 local jobs 降级。

如果最终采用 Harness 长会话，生产前至少要完成其一：

- 每个 conversation/session 由单一 Agent service shard 持有，并用数据库 lease/fencing token 确保永远只有一个 writer；或
- 实现 PostgreSQL `SessionPersistence`，append 使用 session revision/CAS，prepare/resume 与 Worker lease 联动，并为“同一业务事务是否同时包含 Harness events”给出明确一致性策略。

## 六、逐项替换判断

| 小团宝现有能力 | Harness 可替换程度 | 判断 |
|---|---|---|
| Mastra `generate()` / Agent loop | **可完整替换** | Harness loop、stream、multi-step tools、retry、compaction、cancel 明显更完整 |
| Mastra tool registry / toolCalls 抽取 | **可完整替换** | 用 `ctx.tools` 和 durable tool call/result；业务 tool body 仍调用 API |
| Agent 技术 transcript | **可替换并增强** | Harness Session 适合作为模型/工具事实源 |
| `AiConversationEvent` 产品事件 | **不可直接删除** | 它还驱动批次、审核、交互、跨设备 UI；近期应双日志关联 |
| `AiInputBatch` | **不可替换** | Harness inbox 没有附件屏障、冻结集合、replyTo/CAS 和业务 snapshot 语义 |
| Workflow Worker / `AiWorkflowJob` | **不可替换** | 默认 jobs 进程内；Session crash recovery 不续跑中断 step；无多进程 lease |
| `AiAgentAttempt` | **保留并映射** | Harness run/turn/step 不等于一次业务 attempt；需记录 harness session/event interval |
| `AiContextManifest` | **保留并增强** | request/header 可提供实际请求证据，但没有资料/草稿/权限版本 |
| 结构化持久追问 | **复用 schema，不复用等待方式** | `ask_user_question` 是 live Promise；小团宝需结束 attempt + DB pending + 新 batch 回复 |
| 表单审核包 / CAS 确认 | **不可替换** | Harness approval 是一次 tool action grant，不是业务候选审核 |
| User/Organization 权限 | **不可替换** | Harness scope/guard 是进程内 capability，不认识业务租户与当前权限 |
| AI Action Gateway | **不可替换，可接到 tool guard/body** | 服务端仍负责目标解析、风险、审计与幂等写入 |
| Shell/file sandbox | **可直接复用** | 但只覆盖文件效果，不覆盖网络/业务权限 |
| attempt 内后台任务 | **可复用 jobs** | 只限进程生命周期；不能冒充 durable Workflow Job |
| subagents | **可新增能力** | 先只读/候选输出，写入仍经父与网关 |

## 七、推荐目标架构与验证顺序

```text
CopilotKit UI / 表单审核
        ↓
小团宝 API（业务权威）
  AiConversation / InputBatch / Interaction / ReviewPackage
  Permission / Action Gateway / Context Manifest
        ↓
PostgreSQL Workflow Worker（可靠执行权威）
  lease / retry / attempt / material barrier / fencing
        ↓
DeepSeek Harness Runtime（Agent 内核）
  Session log / inbox / loop / compaction / tools / cancel
  小团宝 Tool Plugin → API Action Gateway
  小团宝 Durable Question Adapter → awaiting_user_input
        ↓
LLM / attempt 内 sandbox、jobs、subagents
```

### 建议先确认的架构决策

> Harness 可以拥有 Agent 的长期技术 Session，而不只拥有单次 Mastra 替代 attempt；但 PostgreSQL 继续拥有业务 Conversation、输入批次、运行租约、attempt、HITL 和业务写入。两者用稳定 id 与事件区间关联，任何一方都不能从自己的局部状态推导另一方已经成功。

这比“仅做 `DeepSeekHarnessExecutor`”更充分利用 Harness，也避免把 developer-preview 的单机持久化能力误当成生产工作流平台。

### PoC 应验证的不是“能不能回复”，而是以下契约

1. **自定义 composition**：只装核心 loop、Session、tools、所需 LLM；不要直接采用 coding persona、bash、文件工具和默认 danger-full-access。
2. **结构化 outcome**：用小团宝插件把完成、追问、审核候选、失败映射为现有四种 `HeadlessExecutionResult`，禁止从最后一条自然语言猜状态。
3. **Transcript correlation**：每个 `AiAgentAttempt` 保存 Harness session id、起止 seq、最终 turn reason 和 request-header hash。
4. **双向取消**：User stop 同时撤销 DB 所有权并触发 Agent cancel；验证旧执行无法写回、模型/工具确实停止。
5. **Crash matrix**：分别杀 Agent runtime、Workflow Worker、API；证明 lease 回收后创建新 attempt，Harness 旧 turn 被标 interrupted，不产生第二份审核包。
6. **Persistent question adapter**：问题使 attempt 正常结束为 `awaiting_user_input`，关页/重启后可答；禁止把 open turn 悬挂到用户回来。
7. **Context proof**：对照 `AiContextManifest` 与 Harness log，证明 event sequences、资料版本/摘要 digest、business snapshot、system/tool/model 全部能追溯。
8. **Writer fencing**：同一 conversation 被两个 Worker/Agent service 同时唤醒时，只有持有数据库 fencing token 的 runtime 能 append/submit outcome。
9. **权限与写入**：Agent 进程伪造 Organization、task 或 payload 时，由 API Action Gateway 拒绝；Harness approval 不改变该结果。

### 进入生产重构前的硬门槛

- 固定 Harness 版本并封装在一个内部 adapter/composition 包中；官方 README 当前明确警告 Developer Preview 会发生 breaking changes。[官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/141eb6fef83422698aef7a981029e843e8161534/README.md#L7-L10)
- 不直接依赖 headless stdout 或 SDK `whenIdle()` 推断业务 outcome。
- 不用 JSONL/SQLite session id 充当跨 Worker 锁。
- 不把 live approval/question Promise 当 durable HITL。
- 不让 Harness Session 事件与 `AiConversationEvent` 无关联地各自成为“唯一事实源”。

## 最终评审意见

认真评审后的结论不是收缩接入，而是**扩大正确的替换范围，同时守住生产边界**：

- DeepSeek Harness 足以成为小团宝下一代 Agent 内核，应优先替换 Mastra、Agent loop、技术 transcript、tools 和运行内控制。
- 它的 Session/Event 模型值得吸收，未来甚至可成为统一事件底座；但当前默认 persistence/jobs/SDK 还不足以直接承担小团宝的多进程业务工作流。
- 小团宝已有 `ContextManifest`、input batch、workflow lease、持久 HITL 和表单审核并非重复造轮子，而是 Harness 当前缺少的业务可靠性层。
- 最有价值的重构不是把两套系统并排，而是把这些业务能力实现为 Harness composition 的宿主约束和插件，使 Harness 负责“Agent 怎么思考和执行”，PostgreSQL 负责“这次业务工作是否被合法、可靠、唯一地完成”。
