# Mastra 全局 Agent 平台能力核查

> 核查日期：2026-08-21  
> 本地版本：`@mastra/core@1.57.0`、`@ag-ui/mastra@1.1.1`、`@copilotkit/runtime@1.67.1`  
> 官方源码快照：Mastra [`1e47b7520cab4cfaa8daed52f17e2e6d14ff7539`](https://github.com/mastra-ai/mastra/tree/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539)  
> 范围：只使用本地安装包、包内类型/README/changelog，以及 Mastra、AG-UI、CopilotKit 官方资料。本文区分“框架能力”“当前采用状态”“小团宝职责边界”。

## 结论

Mastra 1.57.0 已足以作为小团宝的 **Agent 执行内核和能力装配层**：它支持按请求动态选择 instructions/model/tools/processors/memory，类型化工具和结构化输出，多步 Agent loop，Memory/Observational Memory，Workflow suspend/resume，子 Agent 与 Agent Network，scorers、tracing、MCP 和 skills；现有 `@ag-ui/mastra + CopilotKit Runtime` 也已经提供了可继续扩展的 UI 流式协议层。

但“全局 Agent 平台”不能解释成“让 Mastra 成为新的业务后端”。推荐边界是：

```text
PostgreSQL 业务控制面
  Workflow Worker / ContextManifest / HITL / Action Gateway / 权限与业务事实
                         ↓ 生成受控运行上下文与工具能力
Agent Platform（Mastra）
  Agent registry / dynamic config / processors / memory / routing / tracing
                         ↓ AG-UI events
CopilotKit 产品交互层
  chat / progress / state projection / interrupt UI / cross-page入口
```

Mastra 可以决定“怎样完成一次推理”，不能决定“用户是否有权执行什么、业务事实是什么、一次长任务是否已经可靠完成”。

## 当前采用总览

| 能力 | 当前项目 | 平台化建议 | 不应承担 |
|---|---|---|---|
| Agent instructions/model/tools | 单一静态建团 Agent | 建立版本化 Agent registry，按服务端上下文动态装配 | 权限、业务规则与最终风险策略 |
| Request Context | 自建 `AsyncLocalStorage` | 引入类型化 Mastra Request Context 传非模型控制元数据 | 接收前端自报身份或替代服务端鉴权 |
| Tool schemas | 4 个工具均有 input schema | 补 output/request-context schema、目标解析和统一错误 | Action Gateway、组织隔离、业务事务 |
| Processors | 未启用 | Token、工具结果、注入检测、敏感信息与兼容性流水线 | 业务事实验证和不可变审计 |
| Memory / OM | 未安装、未启用 | 技术会话历史压缩 PoC | 业务草稿、证据、授权、ContextManifest |
| Workflows | 未在 Agent 服务使用 | 只用于 bounded 技术编排 | PostgreSQL durable Worker 和跨日业务 HITL |
| Subagents / Network | 未使用 | 先确定性路由，再按需引入专长 Agent | 权限路由、业务状态机和提交决策 |
| Structured output | 未使用 Mastra structuredOutput | 用于 proposal/plan/extraction | 跳过服务端 schema 与事实复验 |
| Evals / tracing | 未启用，`logger: false` | 建立 trace、离线 eval 和发布门禁 | 财务/权限审计记录 |
| MCP / skills | 未使用 | MCP 接外部只读能力；skills 渐进加载知识 | 绕过 Gateway 的万能工具与可信业务事实 |
| AG-UI / CopilotKit | 已接本地 Mastra Agent | 保留为统一产品协议和呈现层 | durable event store、业务 HITL 单一真相 |

## 一、动态 Agent 配置与 Request Context

`AgentConfig` 的 `instructions`、`model`、`tools`、`workflows`、`agents`、`scorers`、`memory`、`inputProcessors`、`outputProcessors` 都接受 `DynamicArgument`；同时可声明 `requestContextSchema`。[本地 Agent 类型](../../apps/agent/node_modules/@mastra/core/dist/agent/types.d.ts#L481-L791) [官方 Request Context](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/server/request-context.mdx)

这适合把平台从“一个万能 Agent”拆成版本化定义：

- `agentId/version`：建团、发团执行、财务核对、资料整理、运营问答等专长 Agent；
- instructions：公共安全边界＋领域能力说明＋本次页面/任务提示；
- model：由服务端按任务风险、模型能力和预算选择，支持 fallback；
- tools：只暴露本次 Organization/User/页面/任务允许看到的能力；
- processors/memory/scorers：按任务类型选择策略组合。

当前项目在 [mastra-agent.ts](../../apps/agent/src/mastra-agent.ts#L18-L41) 中静态创建一个 Agent，instructions、model 和四个 tools 都在启动时固定；运行身份则通过自建 [AssistRequestContext](../../apps/agent/src/assist-request-context.ts#L1-L27) 传递。

推荐逐步把 `taskId/runId/conversationId/inputBatchId/attemptId/contextManifestId` 等关联元数据迁入经过 schema 校验的 Request Context，供动态装配、工具与 trace 复用。但 `delegationToken`、组织归属和权限集合必须由后端根据已认证请求写入，不能接受模型或浏览器自报，也不应被拼进模型 prompt。

## 二、Tools、Schema 与 Action Gateway

Mastra `createTool()` 支持 `inputSchema`、`outputSchema`、`requestContextSchema`、`suspendSchema`、`resumeSchema`，执行上下文可访问类型化 Request Context。[本地 Tool 类型](../../apps/agent/node_modules/@mastra/core/dist/tools/tool.d.ts#L65-L82) [本地执行上下文](../../apps/agent/node_modules/@mastra/core/dist/tools/types.d.ts#L454-L516)

当前四个工具已经用 Zod 定义输入，例如资料读取固定要求 `materialId + parseResultVersion`，[get-material-parse-result.tool.ts](../../apps/agent/src/get-material-parse-result.tool.ts#L13-L64)；但工具普遍没有声明 `outputSchema`，身份上下文也未使用 Mastra 的 `requestContextSchema`。

平台化建议：

1. 每个工具都声明 model-facing input、model-facing output 和 request-context schema；工具返回只包含模型确实需要的字段。
2. 工具注册表按 `read / propose / execute`、领域、风险级别和所需 capability 分类。
3. 利用 1.57.0 新增的 `processToolResult` 在结果进入模型历史前做大小限制、敏感信息处理和 prompt-injection 检测。[本地 changelog](../../apps/agent/node_modules/@mastra/core/CHANGELOG.md#L32-L43)
4. 所有领域动作仍走服务端 Action Gateway：规范化目标、权限/归属/版本复查、幂等键、审计与事务均不交给 tool schema。

Schema 只能证明“形状正确”，不能证明资料属于当前任务、User 有权操作、候选证据真实或数据库提交成功。

## 三、Processors 与 Token 控制

Mastra processors 可在输入、每个 Agent step、工具结果、输出 stream/result 和错误路径介入。[官方 Processors](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/agents/processors.mdx)

推荐形成固定顺序的平台代理流水线：

```text
Context Builder
→ Unicode/历史兼容处理
→ Prompt/Tool-result injection guard
→ PII/敏感字段最小化
→ TokenLimiter(contiguous) 最终安全网
→ 模型
→ 输出 guard / structured validation
→ tracing / usage / scorer
```

`TokenLimiterProcessor` 在每个 tool-loop step 前执行，使用 `tokenx` 估算并整条移除消息；它不摘要、不理解业务优先级，也未保证覆盖工具 Schema 和供应商包装。[本地类型](../../apps/agent/node_modules/@mastra/core/dist/processors/processors/token-limiter.d.ts#L7-L92) [官方源码](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/packages/core/src/processors/processors/token-limiter.ts#L139-L220)

因此 processors 是运行时防护层，不替代 Context Builder 的确定性选择、Manifest 记录、业务证据验证或服务端字段策略。完整上下文结论见 [Mastra 上下文工程核查](./2026-mastra-context-engineering.zh-CN.md)。

## 四、Memory 与 Observational Memory

Mastra Memory 可提供 message history、working memory、semantic recall 和 Observational Memory。OM 用 Observer 压缩旧消息/工具结果，用 Reflector 再压缩 observations，并支持异步 buffering 与 retrieval 回看原始消息。[官方 OM](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/observational-memory.mdx) [官方 Memory Processors](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/memory-processors.mdx)

当前 `apps/agent` 没有依赖 `@mastra/memory` 或 storage adapter，也没有给 Agent 配置 memory。[package.json](../../apps/agent/package.json#L12-L18) [mastra-agent.ts](../../apps/agent/src/mastra-agent.ts#L23-L33)

OM 可以作为全局 Agent 平台的“技术会话压缩层”，但必须满足：

- 原始 `AiConversationEvent`、业务事实、资料和审核记录仍留在 PostgreSQL；
- 每次运行由 Context Builder 重新注入当前权威事实，不能信任旧 observation 代表现状；
- 记录 observation 输入范围、模型/配置版本和输出 hash，明确标注为派生内容；
- 高风险动作和证据引用不得只依赖 observation 摘要。

特别注意：当前 AG-UI 注册把所有请求都设置为固定 `resourceId: 'ai-create-readonly-assist'`。[server.ts](../../apps/agent/src/server.ts#L40-L47) 官方接入说明要求 Memory 场景使用稳定的**每 User** resource id，literal `default` 只适合单租户 demo。[CopilotKit 包内官方 Mastra 指南](../../apps/agent/node_modules/@copilotkit/runtime/skills/runtime/references/wiring-mastra.md#L26-L38) 因此在改成服务端解析的 per-user/per-org 隔离键之前，**禁止直接开启 resource-scoped Memory**，否则存在跨 User 污染风险。

## 五、Workflows 与 suspend/resume

Mastra Workflow 支持 schema 化 steps、顺序/分支/循环/并行、state、snapshots，以及带 `suspendSchema/resumeSchema` 的 suspend/resume。[官方 Workflow](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/workflows/overview.mdx) [官方 suspend/resume](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/workflows/suspend-and-resume.mdx) [本地类型](../../apps/agent/node_modules/@mastra/core/dist/workflows/workflow.d.ts#L62-L124)

推荐用途是 bounded 技术编排，例如“搜索多来源 → 汇总 → 结构化 proposal”“资料读取 → OCR 质量分析 → 建议”；它也可承载一次运行内部的短暂停顿。

不建议用它替换现有 PostgreSQL Workflow Worker 和业务 HITL：小团宝仍需要跨进程租约、attempt fencing、幂等、CAS、批次状态、跨设备恢复、User 审核记录和业务动作的原子提交。Mastra suspend event 可以投影成 UI interrupt，但真正可恢复的审核状态必须先持久化到小团宝数据库。

## 六、专长 Agents、Network 与路由

Agent 可动态注册 `agents` 子 Agent；Mastra Agent Network 则由 routing Agent 在 agents/workflows/tools 中选择并循环执行。[本地 Agent 类型](../../apps/agent/node_modules/@mastra/core/dist/agent/types.d.ts#L573-L659) [官方 Agent Networks](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/agents/networks.mdx)

推荐演进顺序：

1. 先按产品入口、任务类型和领域做**确定性服务端路由**，选择建团、执行、财务或资料 Agent。
2. 每个专长 Agent 只拿最小工具集和独立 instructions/evals。
3. 只有跨领域只读分析确实需要动态协作时，才引入 supervisor/network；子 Agent 输出作为 proposal 返回主 Agent。

LLM router 不能决定组织权限、数据作用域、风险级别、是否允许提交或应该恢复哪个业务批次。Network 也不是 durable saga；多个 Agent 的“都回答完成”不等于多个数据库动作已事务提交。

当前 1.57.0 还有一个明确组合限制：runtime 会拒绝在 Agent Network 中使用 Observational Memory。因此“OM 长会话 Agent”和“Network supervisor”不能被规划成同一个直接启用的配置，必须拆层或等待官方兼容能力，并以本地版本重新验证。[本地 runtime](../../apps/agent/node_modules/@mastra/core/dist/agent-Dj30gJa3.js#L26267)

## 七、Structured Output

Mastra `generate/stream` 支持 `structuredOutput`，Agent/Workflow step 也能声明 output schema。[官方 Structured Output](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/agents/structured-output.mdx) [本地 Agent API](../../apps/agent/node_modules/@mastra/core/dist/agent/agent.d.ts#L1193-L1270)

它适合：意图分类、上下文摘要、只读计划、候选 proposal、抽取结果和 specialist handoff。当前 headless 路径仍主要从最终 text/toolCalls 映射结果，并在 Agent 返回后用共享 schema 校验；尚未使用 Mastra `structuredOutput`。[headless-execution.ts](../../apps/agent/src/headless-execution.ts#L129-L154)

结构化输出仍是模型输出。服务端必须再次验证对象版本、证据、目标归属、权限和业务不变量；不能因为 Zod 解析成功就直接写业务表。

## 八、Evals、Observability 与 Tracing

Mastra 支持 Agent scorers、离线 eval、trace scoring，以及 Agent/model/tool/workflow/processors spans；`Mastra` 可配置 observability exporters。[官方 Evals](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/evals/overview.mdx) [官方 Observability](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/observability/overview.mdx) [本地 Mastra 类型](../../apps/agent/node_modules/@mastra/core/dist/mastra/index.d.ts#L129-L152)

当前 `new Mastra()` 设置 `logger: false`，未注册 storage、observability 或 scorers，依赖中也没有完整 exporter 所需的 `@mastra/observability` addon。[mastra-agent.ts](../../apps/agent/src/mastra-agent.ts#L38-L41) [package.json](../../apps/agent/package.json#L12-L18)

平台首批应记录 `conversationId/inputBatchId/attemptId/contextManifestId/agentId/agentVersion/model/toolSchemaVersion`，采集每 step usage、延迟、工具错误、processor tripwire 和结构化结果。离线数据集至少覆盖：事实一致性、候选证据、工具选择、越权拒绝、上下文裁剪和长会话恢复。

Tracing/evals 是诊断与质量证据，不是业务审计：trace 可能采样、脱敏、过期或 exporter 失败；Action Gateway 决策、User 确认与数据库提交仍需业务表永久记录。Delegation token、原始敏感资料和跨组织标识不得进入普通 trace attributes。

## 九、MCP 与 Skills

Mastra 提供 MCP client/server 集成；1.57.0 core 也原生包含 Agent skills/workspace skills 类型和渐进加载 processors。[官方 MCP](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/connections/mcp.mdx) [官方 Skills](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/skills.mdx) [本地 Skills 类型](../../apps/agent/node_modules/@mastra/core/dist/workspace/skills/types.d.ts)

推荐：Skills 保存低风险、版本化的领域操作说明和示例，按需加载以减少 system prompt；MCP 用于接入边界清晰的外部查询/文件/知识能力。当前项目未配置 MCP、workspace 或 skills，也没有安装实际 MCP client/server 集成所需的 `@mastra/mcp` addon。

禁止把 Skills 当权限策略或事实数据库；禁止把一个带广泛凭据的 MCP server 暴露给所有 Agent。任何能读写小团宝业务数据的 MCP/tool 都必须绑定 Organization/User/任务目标并经过 Action Gateway，外部 MCP 返回还需按不可信工具结果处理。

## 十、AG-UI 与 CopilotKit

当前项目已经走正确的主方向：`MastraAgent.getLocalAgents()` 将 Mastra Agent 注册给 `CopilotRuntime`，再通过 `createCopilotRuntimeHandler()` 暴露 `/copilotkit`。[server.ts](../../apps/agent/src/server.ts#L40-L52) `@ag-ui/mastra` 官方声明支持流式 tool events、状态同步、Memory，以及把 Mastra tool suspend/resume 映射为 AG-UI interrupt；当前 CopilotKit 1.67.1 已高于标准 interrupt 要求的 1.61.2。[本地 AG-UI README](../../apps/agent/node_modules/@ag-ui/mastra/README.md#L44-L81)

建议继续让 CopilotKit/AG-UI 承担：统一聊天 shell、流式文字/工具进度、页面状态投影、标准 interrupt 呈现和跨页面 Agent 入口。Ant Design 继续承担表单、审核包、业务记录和高风险确认。

它不应承担 durable 单一真相。CopilotKit runner 的线程并发、connect/replay/stop 是交互运行协议；即使换成持久 runner，也不能自动获得小团宝 input batch、attempt、lease、ContextManifest 和原子业务提交语义。[CopilotKit 包内 Runner 指南](../../apps/agent/node_modules/@copilotkit/runtime/skills/runtime/references/agent-runners.md#L62-L100)

## 推荐实施顺序

1. **平台地基**：版本化 Agent registry、类型化服务端 Request Context、工具 output schema、最小工具授权和统一 processor pipeline。
2. **可观测发布门**：trace/usage/错误关联、离线场景集、关键 scorer；明确业务审计与 trace 分离。
3. **专长 Agent 竖切**：选择一个建团之外的只读/低风险场景，使用确定性路由验证公共平台契约。
4. **上下文工程**：接入 TokenLimiter 安全网；在解决 per-user resource 隔离后做 OM thread-scope PoC。
5. **协作能力**：结构化 specialist handoff；仅在确有收益时引入 Agent Network。
6. **外部生态**：按最小权限接入 MCP/skills；所有业务动作继续走 Gateway。

在这六步完成前，不建议先建设“一个能访问所有工具的全局 Agent”，也不建议迁移现有 PostgreSQL durable Worker/HITL。平台化的第一目标应是统一契约、隔离和观测，而不是扩大 Agent 的直接权限。

## 本地版本证据

- 三个依赖版本声明：[apps/agent/package.json](../../apps/agent/package.json#L12-L18)；实际安装包分别为 `@mastra/core@1.57.0`、`@ag-ui/mastra@1.1.1`、`@copilotkit/runtime@1.67.1`。
- 当前 Agent 为静态 instructions/model/tools：[mastra-agent.ts](../../apps/agent/src/mastra-agent.ts#L18-L41)。
- 当前 AG-UI/CopilotKit 入口与固定 resource id：[server.ts](../../apps/agent/src/server.ts#L40-L61)。
- 当前运行关联上下文由 AsyncLocalStorage 承载：[assist-request-context.ts](../../apps/agent/src/assist-request-context.ts#L1-L27)。
- 当前四个工具均通过服务端 API 客户端执行，没有直接访问数据库：[工具示例](../../apps/agent/src/get-task-context.tool.ts#L13-L34)。
