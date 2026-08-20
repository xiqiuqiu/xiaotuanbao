# OpenBot 代理治理对小团宝的借鉴研究

> 研究日期：2026-08-20
>
> 源码快照：OpenBot [`93ff1b1`](https://github.com/CopilotKit/openbot/commit/93ff1b1)（本地路径 `/Users/sigclr/Projects/openbot`）；小团宝当时工作区 `2604a47` 加未提交的 AI 建团改动。
> 范围：只核对 OpenBot 官方仓库文档与源码、小团宝 ADR-0043/0045/0046、`CONTEXT.md` 中的 AI 词汇，以及已有提案 `ider/xiaotuanbao-agent-governance-refactor-plan.docx`。本文区分源码事实和针对小团宝的架构推论。后续架构决策见 [ADR-0047](../adr/0047-ai-action-gateway.md)。

## 结论

OpenBot 值得小团宝直接吸收的，不是「一 Bot 一浏览器」或 CopilotKit Intelligence，而是一条**深度模块**边界：

> 模型只提出动作；服务端自己解析目标；策略先决定；先写下决策行；只有 `forward` 才执行。没有记录的动作视为没有发生。

小团宝已经有更深的 **Durable Workflow Layer**（会话、批次、Worker、Context Manifest、表单审核 CAS）。缺的是夹在 Agent Runtime 与业务 Service 之间的 **Agent Governance Layer**。现有 `AiToolController` + 双 Guard 只证明「谁在调」，不回答「这一次调用该不该发生、按哪条规则、事后如何复盘」。

已有提案 `ider/xiaotuanbao-agent-governance-refactor-plan.docx` 的方向与源码核对后成立：直接采用 Gateway / 先审计再执行 / fail-closed / grant≠policy / Shadow Mode；第一版**不要**引入 CEL 或 per-Bot computer。本文补充三件提案里写得不够硬的源码事实：

1. 网关最致命的一步是 **服务端解析目标**，不是写策略表达式。
2. **决策行与失败行必须分开**：policy 允许 ≠ 业务已经发生。
3. **循环检测只观测、不拒绝**；拒绝权留给策略。小团宝还有一条必须先收编的旁路：`AiWorkflowProcessor.persistReviewPackage()`。

## 两边各自已经解决什么

| 层 | OpenBot | 小团宝现状 |
|---|---|---|
| 可靠运行 | 依赖 CopilotKit Intelligence 持久化 thread；Bot 本身无作业租约 | ADR-0046 已落地：`AiConversation` / `AiInputBatch` / `AiWorkflowJob` / `AiAgentAttempt` / `AiContextManifest` |
| 动作治理 | `createComputerGateway().govern()` + 同一套 CEL 用于 MCP | **无**统一 Gateway；`AiToolController` 认证通过即调 `*ForAgent()` |
| 业务事实 | 几乎没有领域模型；动作落在外部网页/文件/MCP | NestJS 领域服务 + Prisma；审核包 CAS 已存在 |
| 人机确认 | 浏览器「接管方向盘」，Bot 动作直接 409 | ADR-0043：候选只在表单确认；聊天不是第二入口 |

推论：小团宝不应把 OpenBot 当运行时替换件，而应把它的治理缝接到已有 Worker/批次之上。

## OpenBot 源码里真正深的模块

以下每条都能通过「删除测试」：删掉该模块，复杂度会重新散落到每个工具调用点。

### 1. `govern()`：记录即路径

文件：[`server/src/computer/gateway.ts`](https://github.com/CopilotKit/openbot/blob/93ff1b1/server/src/computer/gateway.ts)

文件头把不变量写死：

1. 用**服务端自己取到的 snapshot** 解析 ref，绝不信调用方声称的 label。
2. 问策略。Deny 压过 allow；缺策略即拒绝；坏规则当拒绝。
3. **无论允许还是拒绝都先写审计行，再执行。**

执行失败再写第二行 `computer.action_failed`，因为「允许」行会被读者读成「已经发生」。重复检测的观测行允许丢失（吞异常）；**决策行不允许丢失**——写不进去就等于动作没发生。

对小团宝的映射：`resolve(ref)` → 服务端按 `targetType + targetId` 读真实 Departure / 客源单 / 资源，校验 `organizationId`，不接受模型自带的组织或权限上下文。

### 2. 策略引擎：deny-before-allow + dry-run + 决策块

文件：[`server/src/computer/policy.ts`](https://github.com/CopilotKit/openbot/blob/93ff1b1/server/src/computer/policy.ts) 的 `evaluateActionPolicy()`

| 原则 | 源码行为 |
|---|---|
| deny 先于 allow | 先遍历 `deny[]`，命中即拒绝 |
| fail-closed | 缺 policy、空 allow、坏 deny 表达式 → 拒绝；坏 allow 表达式不当放行 |
| `allowed` ≠ `forward` | `dry-run` 时 `allowed: false` 仍 `forward: true`，用于对真实流量试规则 |
| 决策可展示 | 返回 `matched`（表达式）、`source`（deny/allow/default）、`reason`（给人看的句子） |

默认 shipped policy 是 `{ deny: [], allow: ["true"] }`。这是通用 coworker 产品为了「开箱能点网页」；**小团宝若照搬会把 fail-closed 做反。** 业务 Agent 的地板应是：未注册动作拒绝。

第一版不需要 CEL。OpenBot 用 CEL，是因为浏览器动作的目标空间是开放的（任意 URL、任意按钮文案）。小团宝的写动作是封闭目录（建团草稿、客源、资源、应收应付）。对封闭目录，**代码注册表比表达式语言更深**：接口更小，规则可测，也不把「组织自定义策略后台」提前做出来。

### 3. Grant 与 Policy 是两个问题

文件：[`server/src/plugins/store.ts`](https://github.com/CopilotKit/openbot/blob/93ff1b1/server/src/plugins/store.ts)

> The grant answers "is this Bot allowed this tool at all". The policy answers "is this particular call permitted right now". Collapsing them would mean an operator who granted a Bot a server had also, invisibly, waived every rule about it.

Coworker 文档同样写明：**standing role 不授予能力**。能力走 grant / 组件发布 / 计算机策略。

这正好对应小团宝 CONTEXT 里已经分开、但代码尚未强制的两层：

- **User 的 Menu/Action Permission**：这个人能不能做（ADR-0023）。
- **AI 业务工具 / Agent Capability**：这次运行是否允许代表该 User 提出这类动作。

当前 `capabilitiesForPendingReview()` 只作为 `getTaskContext` 的提示字段，Mastra 侧仍固定注册 4 个工具，API 不 enforcement。

### 4. Repeat 检测与拒绝权分离

文件：[`server/src/computer/repeat.ts`](https://github.com/CopilotKit/openbot/blob/93ff1b1/server/src/computer/repeat.ts)

- fingerprint = 工具 + 目标（ref / key / file / url），**不含键入文本**。
- 阈值 3 / 10 / 25 各写一次 `computer.action_repeated`。
- **检测器从不拒绝**；CEL 里写 `repeat.count >= 10` 才拦。
- 内存、单进程；多副本会把计数拆开。这是已知缺口，不是隐藏特性。

小团宝应对齐这个缝：Worker 重试解决的是基础设施失败；fingerprint 解决的是模型在同一 `actionName + target + inputHash` 上打转。两者不要合成一个计数器。

### 5. 测试写成不变量，而不是调用剧本

文件：[`server/tests/computer-gateway.test.ts`](https://github.com/CopilotKit/openbot/blob/93ff1b1/server/tests/computer-gateway.test.ts)

网关测试明确只保证四件事：

1. 被拒绝的动作到不了 computer。
2. 允许和拒绝都写行，轨迹不能只有成功。
3. 策略看到的是服务端解析出的元素，不是调用方标签。
4. 键入文本不进审计 payload。

这四条可以直接改写成小团宝 Gateway 的验收：拒绝到不了 `*ForAgent` / 领域写入；决策先行；目标由服务端加载；审核包全文与证件号不进 audit。

### 6. 人工控制：拒绝，不排队

[`agent-computer/src/control.ts`](https://github.com/CopilotKit/openbot/blob/93ff1b1/agent-computer/src/control.ts) + gateway 的 control 事件。人在开车时 Bot 动作 409，而不是排到人放手之后再自动点下去。密钥走独立通道，审计只记「要过密钥、几个字符」，不记密文。

小团宝没有浏览器共驾。对应物是提案中的 Control Ownership：`USER_CONTROL` / `REVIEW_CONTROL` 下禁止覆盖用户正在编的字段或未处置审核，而不是把 Agent 写操作缓存起来等人一松手就回放。

## 明确不要照搬

| OpenBot | 为何不进入小团宝 |
|---|---|
| `agent-computer` + Playwright snapshot ref | 小团宝写的是领域命令，不是网页元素 |
| Supervisor / 一 Bot 一容器 / gVisor | 多租户 SaaS 用 Organization 隔离即可；运维面不成比例 |
| CopilotKit Intelligence 作为会话真相 | ADR-0046 已用自己的会话事件与批次；Intelligence 会变成第二套身份 |
| 前端执行工具循环（Bot emit → 浏览器 fetch gateway） | 小团宝已是 Worker → headless → HTTP 工具，这条更适合治理 |
| 默认 `allow: ["true"]` | 业务写操作必须默认拒绝未注册动作 |
| 组件画廊 / 沙箱 Playground / 外部 MCP 目录 | 产品表面是发团表单与审核条，不是通用 coworker 工作台 |
| 第一版 CEL 策略后台 | 封闭动作目录用代码注册更深；组织级 DSL 是后置需求 |

客户端工具循环尤其不要倒回去：OpenBot 那样做，是因为人要看着 Bot 的屏幕。小团宝的人看的是中间表单。工具执行放在 Agent 进程再经 API，已经把「唯一行动边界」放在了 NestJS 一侧。

## 接到小团宝的缝

### 首选：加深 `AiToolController`，不要另开平行入口

现有四个工具已经集中在 `apps/api/src/modules/ai-create-task/ai-tool.controller.ts`：

- `POST /api/ai-tools/v1/get-task-context`
- `POST /api/ai-tools/v1/submit-review-package`
- `POST /api/ai-tools/v1/search-route-templates`
- `POST /api/ai-tools/v1/get-material-parse-result`

Guard 已经给出 Actor（服务身份 + 操作委托 + `departure:write`）。缺的是把 `*ForAgent()` 包进一个 `AgentActionGateway.execute(proposal)`：Resolve Target → Permission → Capability → Preconditions → Risk → Repeat 观测 → **persist decision** → 视 Shadow/Enforce 决定是否调用现有 Service。

这是浅模块变深模块，不是新造一套工具协议。契约继续留在 `packages/ai-contracts`。

### 必须同时收编的旁路

`AiWorkflowProcessor.persistReviewPackage()`（`ai-workflow.processor.ts`）在 headless 结果返回后**直接写** `ai_review_packages`，不经过 `AiToolController`。Gateway 若只包 HTTP 工具，这条路径仍能在无决策行的情况下产生待确认候选。

目标态：审核包只作为 Gateway `REVIEW` 决策的持久化投影；Worker 只消费已有 `actionId`，不再自己 insert 审核包。Shadow Mode 期间至少也要给这条旁路写预测决策，否则审计覆盖率是假的。

### 不作为第一缝的位置

| 位置 | 原因 |
|---|---|
| `apps/agent/*.client.ts` | Agent 进程写的审计不是权威；权限撤销后仍可能「看起来记了」 |
| Mastra `createTool()` | 框架适配层，治理应 fail-closed 落在 API |
| `AiHeadlessClient` | 只触发 attempt，没有 tool 粒度 |

## 对已有提案的核对

`ider/xiaotuanbao-agent-governance-refactor-plan.docx`（v1.0，2026-08-20，Proposal）与本次源码核对 **总体一致**。建议在写成 ADR-0047 时补上下面几条，避免实现时走样。

| 提案原文 | 源码核对后的加强 |
|---|---|
| Resolve Target | 写明：组织、对象版本、权限上下文以服务端加载为准；模型 payload 里的这些字段最多当提示，不能当证据 |
| Audit before execution | 拆成两行语义：`decision` 行与 `execution_failed` 行；禁止用一条「结果」行同时表示允许和发生 |
| Shadow Mode | 对应 OpenBot 的 `mode: "dry-run"`：`allowed` 仍按策略算，`forward` 仍走旧逻辑；正式 enforcement 前这条必须能在真实流量上跑 |
| Repeat / Loop | 检测器只写观测；阈值拒绝是策略的事。不要把 Worker `WORKFLOW_MAX_ATTEMPTS` 和模型循环合成一个计数 |
| Skills ≠ capabilities | 对应：系统提示词 / `READONLY_ASSIST_INSTRUCTIONS` 不赋权；Mastra 注册表不能宽于 Gateway 注册表 |
| 第一版不引入 CEL | 同意。CEL 是开放目标空间的工具；小团宝动作目录是封闭的 |
| Review Package → Action Review | 同意方向，但迁移期必须保持**单一确认入口**（ADR-0043）；禁止聊天与表单各审一次 |
| Control Ownership | 语义对齐「人在开则 Bot 拒绝而非排队」；不要做成延迟队列 |

提案中「第一阶段只完成协议 + 审计模型 + Shadow Mode + 现有建团 Tool 接入，稳定前不把 AI 扩到财务写」这条应坚持。OpenBot 自己也是先把所有副作用收进一个网关，再谈 MCP 和组件。

## 推荐的模块形状（推论）

按仓库 codebase-design 词汇：Gateway 应是一个**深模块**——调用方只看见 `execute(proposal) → { decision, result? }`，内部藏解析、权限、风险、幂等、审计。测试只穿过这个缝。

建议的内部步骤（实现细节留给 ADR，此处只定顺序，与 OpenBot `govern()` 同构）：

1. 解析 Actor（委托里已有 User / Organization / task / batch / attempt / manifest）。
2. 解析 Target（服务端读对象；组织不一致即拒绝）。
3. 查动作是否在注册表（未知即拒绝）。
4. 查 User Permission（现有 Guard / actionKeys，不降低）。
5. 查 Agent Capability（当前任务/阶段是否授予该类动作）。
6. 业务前置条件（对象版本、已有 pending 审核、财务介入锁等）。
7. 风险分级 → ALLOW / REVIEW / DENY。
8. Repeat 观测（独立行，失败不阻断决策行）。
9. 持久化决策。
10. `forward` 时调用现有领域 Service；失败再补执行结果行。

R0 只读（搜路线、读上下文、读解析页）可以走同一网关但审计更轻；**不要**学 OpenBot 把 snapshot 完全旁路——小团宝的「读」仍有 Organization 隔离。差别只在风险和是否产生 Review，不在是否绕过入口。

## 与 ADR-0046 的关系

不矛盾。ADR-0046 解决「这次运行用了哪些输入、能否在页面关掉后继续」。OpenBot 式 Gateway 解决「这次工具调用该不该变成业务事实」。Context Manifest 回答模型看见了什么；AgentAction 回答提出了什么、为何允许、谁确认、最终写了什么。两条证据链都要，不能互相替代。

## 后续决策

架构不变量已写入 [ADR-0047](../adr/0047-ai-action-gateway.md)。实现应从观察模式接入现有 AI 建团工具（含 `persistReviewPackage` 旁路）开始，稳定前不把 AI 写路径扩到财务。
