---
status: accepted
---

# AI 动作经统一网关先决策、先记录、再执行

ADR-0046 已把 AI 建团的执行生命周期收到服务端。生产主写却仍绕过统一治理：无头执行从 toolCalls 抽出候选，Worker 的 `persistReviewPackage()` 直接插入 AI 阶段审核包；HTTP `AiToolController` 四个 `v1/*` 在 Guard 通过后直调 `*ForAgent()`。两者都不能回答「提出了什么、对哪个真实对象、为何允许、是否已经发生」。

决定在编排层与业务服务之间增加 **AI 动作网关**：Agent 只提出 **AI 动作**；服务端解析真实目标后决定允许、提交审核或拒绝；先持久化决策，只有 `forward` 才产生业务效果。读与写都是 AI 动作、都走同一入口。写类没有决策记录视为没有发生；只读决策留痕失败不阻断读取。本 ADR 不取代 ADR-0046，也不改变 ADR-0043 的表单确认面。

源码对照见 [`docs/research/2026-openbot-agent-governance-lessons.zh-CN.md`](../research/2026-openbot-agent-governance-lessons.zh-CN.md)。边界参考 OpenBot `govern()` 的 decide → record → act，但目标是领域对象而非浏览器元素；第一版策略是代码注册表而非 CEL。调研笔记里「先加深 Controller」已被现网主写路径修正：第一刀的主调用方是 Worker。

## 三层边界

| 层 | 职责 | 权威 |
|---|---|---|
| Durable Workflow（ADR-0046） | 会话、批次、作业、attempt、Context Manifest、跨设备恢复 | 这次运行用了哪些输入、能否在页面关掉后继续 |
| AI 动作网关（本 ADR） | 解析目标、User 权限、AI 动作能力、风险、重复观测、决策审计、是否执行 | 这次提出该不该变成业务事实 |
| 业务事实 | NestJS 领域服务、对象版本、组织隔离、财务命令 | 最终能否写入；网关通过不降低原有校验 |

Context Manifest 回答模型看见了什么；AI 动作回答提出了什么。两条证据链都要。系统提示词、技能说明和 `availableCapabilities` 不赋权。

## 调用缝

深模块只暴露 `execute(proposal)`。解析、注册表、权限、能力预测、风险、重放找回、决策持久化、重复观测都藏在内部；`forward` 由适配器注入。测试只穿过这一缝。

- **主调用方**：`AiWorkflowProcessor`。headless 的 `awaiting_review` 先经网关，再投影审核包。不把无头改成再打一遍 HTTP submit。
- **第二适配器**：HTTP `*ForAgent()`，直到 `#323` 拆掉浏览器执行链。协助窗已不 `runAgent()`；不要把 Controller 当成生产主缝，也不必等整张 `#323` 才做网关。
- 禁止在 `apps/agent` 或 Mastra `createTool()` 内做权威允许/拒绝。

模块落在独立的 `ai-action`（或同名）Nest 模块，不塞进 `ai-create-task` 服务内部，也不放到 `packages/shared` / `apps/agent`。

## 网关不变量

1. **解析 Actor**：从委托或 Worker 认领上下文读取 User、Organization、任务、会话、批次、attempt、Context Manifest；委托无效即拒绝。Worker 路径始终有 attempt，并可挂已有 Context Manifest。HTTP 委托若无 attempt，重放键用 `runId` 顶这一截，不新建 attempt。
2. **解析目标**：服务端从委托加载真实对象并校验 Organization。模型 payload 里的组织、权限、对象标识最多当提示，对不上则拒绝并仍留决策记录（写类因此不投影审核包）。第一刀目标：`getTaskContext` → 该 AI 建团任务；`submitReviewPackage` → 该任务的发团创建草稿（含对象版本）；`getMaterialParseResult` → 该任务下指定发团资料档案；`searchRouteTemplates` → 该 Organization 的常用路线目录。
3. **查注册表**：第一刀注册表即四个 AI 业务工具名。未注册立即拒绝。缺策略、坏规则、未知动作 fail-closed。
4. **查 User 权限**：复用 Menu Permission / Action Permission（ADR-0023）。无权则拒绝；网关不扩大权限。
5. **查 AI 动作能力**：与步骤 4 分离。第一刀能力目录暂为 `capabilitiesForPendingReview`；观察期只记账不拦。
6. **业务前置条件**：对象版本、已有待确认审核包、任务状态等仍由领域规则定义；观察期两个适配器保留各自旧副作用（HTTP `REVIEW_PENDING`，Worker 复用已有包）。
7. **风险**：R0 只读默认允许；`submitReviewPackage` 永远是 `REVIEW`，执行 = 投影审核包，不得直接写发团创建草稿。R3/R4 财务与不可逆写在强制稳定前不得作为 Agent 可执行路径开放。第一版等级写在代码注册表，不引入 CEL，也不提供 Organization 级策略后台。
8. **两套指纹，互不混用**。作业重放：`attempt`（或缺省时 `runId`）+ 动作名 + 目标 + 输入哈希 → 找回或创建**同一 AI 动作**。模型打转：动作名 + 目标 + 输入哈希（不含 attempt、不含自由文本全文）→ 只写观测，自身不拒绝；写失败吞掉。观测行不是动作身份，也不是 `WORKFLOW_MAX_ATTEMPTS` 或 AI 活动运行预算。
9. **一个 AI 动作身份**：决策与执行结果同属它；执行失败补结果，不另开动作。调用方不铸造 id。允许、审核、拒绝都先持久化。写类决策行写不进则 `forward` 不跑；只读决策行失败仍可 `forward`。
10. **`forward` 时才产生业务效果**。观察期 `forward` 仍调用现有 `*ForAgent()` / `persistReviewPackage()`。动作记录只留安全摘要：动作名、目标引用、决策、原因码、输入哈希、候选 `fieldKey`。字段值、evidence 原文、审核包全文、证件号、密钥不进动作 payload。

人工表单保存、User 确认/拒绝审核包的 HTTP 第一阶段不进网关。人在编辑或审核未处置时，Agent 不得覆盖对应字段，也不得把未执行动作排队到人松手后自动回放。

## 审核包是 REVIEW 的投影

当前阶段至多一份待确认 **AI 阶段审核包**。第一次成功投影的写类 AI 动作是其来源；其后同阶段的 REVIEW 形成新动作，但不另开包、不改来源。查看、修正、确认与拒绝只在中间表单完成。聊天不是第二套确认入口。多设备以审核包版本 / CAS 保证首个处置生效。

禁止网关审核与旧审核包两个确认入口并存。目标态：Worker 只消费已有动作身份并投影包，不再自行当作无动作的 insert。第一刀在同事务里先有动作、再投影包，观察期仍允许适配器保留旧的 pending 处理差异。

## 幂等

Worker 仍是至少一次执行。同一 attempt（或 HTTP 的 `runId` 顶替）上的相同提案找回同一动作，业务效果仍有效一次。任务内一份 pending 挡住跨动作的第二份包；它不是同一动作重放的键。后续写命令可以该动作身份作为稳定幂等来源（`agent-action:{id}`），扩展 ADR-0017。重复 OCR 或模型调用仍可能产生费用，但不能产生第二份有效待确认包或第二套业务编号。

## 第一阶段交付边界

- 不替换 Mastra，不引入 LangGraph / 一 Agent 一浏览器 / gVisor / CopilotKit Intelligence 作为会话真相。
- 不重写 AiConversation、AiInputBatch、Workflow Worker、Context Manifest。
- 第一刀**写死观察期**：未注册拒绝，能力/风险/重复只记账不拦。没有环境变量或 Organization 开关能切成强制。切强制是以后一次显式改动。
- 不把整张 `#323` 当前置；按 Worker 已是唯一执行者来设计。
- 稳定前不把 AI 写路径扩到财务。完整动作目录后台、组织级策略 DSL、通用动作审核改名、协作控制权的独立状态机均后置，但不得违反本 ADR 的入口、审计与写类 fail-closed 边界。

## Consequences

- 每次 Agent 提出都能回答：谁提出、对哪个真实对象、按哪条注册规则、允许/审核/拒绝、是否真正执行、与哪次批次和 Context Manifest 相连。
- 新增工具的默认路径是注册动作并走 `execute()`，而不是在 Service 里复制权限与审核分支。
- 代价是多一次决策持久化，以及观察期与旧 `forward` 并存的纪律；换来的是财务级动作可被拦住，而不是先散落到各个工具再补审计。

## Considered Options

- **继续让各 Tool Service 自行治理：** 实现小，但客源/资源/财务会复制规则，且 Worker 直写无法被单一测试证明「拒绝到不了写入」。
- **把 CopilotKit / Mastra 工具层当网关：** 编排进程崩溃或被绕过时没有权威记录。
- **先加深 `AiToolController`、Worker 另打预测日志：** 生产主写不经 Controller；审计是假的。
- **先改无头去真打 HTTP submit，再只包 Controller：** 改变现网执行语义，观察期不该付这次成本。
- **等 `#323` 全部验收后再做网关：** 把 ADR-0046 收口与本治理绑成一条前置；`#323` 仍被 `#321`/`#322` 挡住。
- **观察期决策记录失败也放行写类：** 动作塌成 AI 运行轨迹，违反「无记录即未发生」。
- **读不算动作 / 读不落库：** 统一入口没有可审计对象，并与 Organization 隔离要求冲突。
- **提交审核包允许 `ALLOW` 直写草稿：** 拆掉 ADR-0043 的单一确认入口。
- **一动作一份待确认包 / 后一次合并改父：** 违反「一阶段一套审核包」，或让来源动作无法对应。
- **Agent 铸造动作 id：** 身份出在编排进程。
- **第一版 CEL、环境开关或 Organization 级强制灰度：** 封闭目录用代码注册表更深；误开强制的成本大于第一刀的灰度收益。
- **让全部人工表单写操作也走网关：** 扩大最终一致性范围；本 ADR 只治理 Agent 发起的动作。
