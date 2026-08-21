# 小团宝 Agent 执行治理重构方案（进度对齐）

文档类型：架构重构 / 实施计划  
版本：v1.1  
日期：2026-08-21  
状态：**观察期已落地（代码在 `main`）**  
对照原文：`ider/xiaotuanbao-agent-governance-refactor-plan.docx`（v1.0，2026-08-20，Proposal）  
权威架构：[`docs/adr/0047-ai-action-gateway.md`](../docs/adr/0047-ai-action-gateway.md)  
词汇：`CONTEXT.md` 中的 **AI 动作**、**AI 动作网关**、**AI 动作能力**、**AI 阶段审核包**、**AI 协作控制权**

> v1.0 Word 稿是提案。正式决策以 ADR-0047 为准；本文件只对齐「提案 → 现网代码」的进度与分叉，不再把未落地项写成已发生。

## 0. 一句话现状

Durable Workflow（ADR-0046）与 AI 动作网关观察期（ADR-0047 第一刀）都已在 `main`。四个 AI 建团工具和 Worker 投影审核包都经 `AiActionGateway.execute()`：未注册拒绝，已注册按接入前逻辑执行并留下动作身份。能力、风险、重复只记账不拦。强制策略、通用动作审核改名、财务写路径、协作控制权状态机都还没做。

对照代码：`HEAD` `54612f7`（`#341` 重复观测，PR `#351`）。

---

## 1. 阶段进度（对照 v1.0 §9）

| 原方案阶段 | 状态 | 现网事实 |
|---|---|---|
| Phase 0：ADR 与动作目录 | **已完成** | ADR-0047 accepted。第一刀目录就是四个 AI 业务工具名，写在网关注册表，不是独立后台。规格票 `#335` 仍 OPEN。 |
| Phase 1：Action + Audit Model | **已完成** | Prisma `AiAction` / `AiActionRepeatObservation`。决策与执行结果同一身份。 |
| Phase 2：Gateway Shadow Mode | **已完成（名称已改）** | 不是可开关 Shadow，而是 **写死观察期**。没有 `AGENT_ACTION_GOVERNANCE_ENABLED` 一类环境变量。 |
| Phase 3：Review 通用化 | **未做** | 仍是 AI 阶段审核包。包上挂了 `sourceActionId`，没有 `ActionReview` 新模型，也没有改名。 |
| Phase 4：启用 Risk Policy | **未做** | 注册表写死 `getTaskContext`/`searchRouteTemplates`/`getMaterialParseResult` → `allow`，`submitReviewPackage` → `review`。原因码对已注册动作是 `OBSERVATION_PERIOD`。能力/风险不拦截。 |
| Phase 5：幂等闭环 + Loop Protection | **部分完成** | 作业重放：`replayKey`（attempt 或 `runId` + 名 + 目标 + 输入哈希）找回同一动作。模型打转：指纹只写观测、自身不拒绝。`agent-action:{id}` 尚未接到财务幂等键。 |
| Phase 6：Control Ownership | **未做独立状态机** | CONTEXT 有 **AI 协作控制权**；第一刀沿用草稿版本 / pending / CAS，没有 `AGENT_CONTROL` / `USER_CONTROL` / `REVIEW_CONTROL` 枚举。 |
| Phase 7：扩展客源 / 资源 / 财务 | **未做** | 稳定前不得开放财务写类 AI 动作（ADR-0047）。 |
| Phase 8：Runtime Adapter | **未做** | Mastra 仍是编排实现；`apps/agent` 的 `createTool()` 不承担允许/拒绝。 |

---

## 2. 代码落点（对照 v1.0 §8）

| 原方案区域 | 原计划 | 现网 |
|---|---|---|
| `apps/api` 新模块 | `agent-action` / governance | **`apps/api/src/modules/ai-action/`**：`AiActionGateway.execute()`、Prisma store、in-memory store、replay / repeat 指纹 |
| Prisma | `AgentAction` / `ActionReview` | **`AiAction`** + **`AiActionRepeatObservation`**。审核仍是 `AiReviewPackage`，新增 `sourceActionId` |
| Agent Tool | 所有写 Tool 先提案 | HTTP 四个工具走 `AiToolHttpAdapter`；Worker `awaiting_review` 走 `AiToolWorkerAdapter.projectReviewPackage()`，同事务先记 REVIEW 再投影包 |
| Workflow Worker | 以 actionId 作稳定身份 | `AiWorkflowProcessor.projectReviewPackageViaGateway()` 把 attempt / batch / manifest 填进 actor；同 attempt 重放找回同一动作且不改包来源 |
| Business Services | 接受稳定幂等键 | 审核包投影要求有 `sourceActionId`。财务命令仍用原 Idempotency-Key，**尚未** `agent-action:{id}` |
| `apps/agent` | 返回标准 Action 结果 | 工具 schema 未改。无头抽出 `submitReviewPackage` 后由 Worker 接网关，不在 Mastra 里决策 |
| `apps/web` | 审核 UI 接 ActionReview | **未改**。确认面仍是中间表单 + AI 阶段审核包（ADR-0043） |
| `packages/shared` | AgentAction DTO | **未放 shared**。类型在 `ai-action.types.ts`；工具名在 `@xiaotuanbao/ai-contracts` |
| `docs/adr` | 建议 ADR-0047 | **已有且 accepted** |
| `docs/architecture` | 增加 Governance Layer | **无此文件**。三层边界写在 ADR-0047 |
| `docs/agents` | Action Catalog / Risk Policy | **未补**。目录就是网关里的 `REGISTERED_ACTIONS` |

### 第一刀注册表（现网）

| 动作名 | kind | 观察期决策 | 目标 |
|---|---|---|---|
| `getTaskContext` | read | allow | `ai_create_task`（任务 id） |
| `searchRouteTemplates` | read | allow | `route_template_catalog`（Organization id） |
| `getMaterialParseResult` | read | allow | `departure_material`（资料档案 id） |
| `submitReviewPackage` | write | review | `departure_creation_draft`（任务 id） |

未注册立即 `deny`（`UNREGISTERED`），写类无决策记录则不 `forward`。自称 `taskId` / `organizationId` 与委托不一致 → `TARGET_MISMATCH`，不转发。只读决策留痕失败仍可读。

v1.0 里的 `route-template.search`、`departure.draft.update`、`receivable.generate` 等 **不是** 现网动作名，也尚未注册。

---

## 3. 相对 v1.0 的硬分叉（实现时不要按 Word 原文做）

这些条目在 ADR-0047 / `#335` 里已经改过，Word 稿仍是旧表述。

| v1.0 原文 | 现网 / ADR-0047 |
|---|---|
| 实体叫 AgentAction，模块叫 Action Gateway | 叫 **AI 动作** / **AI 动作网关**（`AiAction` / `AiActionGateway`） |
| Shadow Mode + 环境开关切 enforcement | **写死观察期**。没有开关能切成强制 |
| Effect：`draft_write` / `business_write` / `finance_write` / `irreversible` | 第一刀只有 **`read` / `write`** |
| Repeat 达阈值可拒绝或转人工 | **只观测、不拒绝**。观测写失败不得挡住决策行 |
| 新增 ActionReview 模型，Review Package 演进为通用审核 | 审核包仍是 **REVIEW 的投影**。一阶段一份 pending；第一次成功投影的写动作是来源 |
| Gateway 内做完整 User Permission / Capability / 前置校验 | 观察期网关：**注册表 + 目标核对 + 决策持久化 + 重复观测**。权限仍在 Guard / 领域服务；`capabilitiesForPendingReview` 仍是提示目录 |
| 主缝是加深 HTTP Tool | **主调用方是 Worker**。HTTP 是第二适配器。`#323` 已关闭，浏览器执行链已删 |
| 建议 `packages/shared` 放协议 | 协议不进 shared / `apps/agent` |
| 循环检测与作业重试共用一套计数 | **两套指纹互不混用**：`replayKey`（含 attempt/`runId`）vs 打转 fingerprint（不含 attempt） |

---

## 4. GitHub 票对照（对照 v1.0 §10）

观察期拆票是 `#335`（规格）+ `#336`–`#341`（tracer bullet）。代码已全部进 `main`，**issue 仍 OPEN**，tracker 落后于代码。

| 原 P 级议题 | 对应票 | 代码 | Issue 状态 |
|---|---|---|---|
| ADR-0047 | `#335` + `docs/adr/0047-...` | ADR 已 accepted | `#335` OPEN（规格票未关） |
| Descriptor Registry + 未注册拒绝 | `#336` / PR `#346` | `REGISTERED_ACTIONS` + `UNREGISTERED` | OPEN |
| Prisma 模型 | 随 `#336` | `AiAction` 等 | 同左 |
| getTaskContext 留痕 | `#337` / PR `#347` | HTTP 适配器 | OPEN |
| 搜路线 / 读解析结果 | `#338` / PR `#348` | 同上，含目标错配拒绝 | OPEN |
| Worker 投影前先有动作 | `#339` / PR `#349` | `projectReviewPackageViaGateway` | OPEN |
| HTTP 提交审核包 | `#340` / PR `#350` | pending 仍回旧错误、不改来源 | OPEN |
| Repeat 只观测 | `#341` / PR `#351` | `AiActionRepeatObservation` | OPEN |
| Risk Policy R0–R4 强制 | 无后续票 | 未做 | — |
| Permission + Capability 强制 | 无后续票 | 未做 | — |
| `agent-action:{id}` 财务幂等 | 无后续票 | 未做 | — |
| Repeat 达阈值拦截 | 明确后置 | 观察期禁止用观测行拒绝 | — |
| Control Ownership 状态机 | 明确后置 | 未做 | — |
| Audit UI | 明确后置 | 未做 | — |
| 客源 / 资源 / 财务扩展 | 明确后置 | 未做 | — |
| Runtime Adapter | 明确后置 | 未做 | — |

`#323`（删除旧浏览器执行链）已 **CLOSED**。ADR-0047 写过「不必等 `#323`」；现网 Worker 已是唯一 Agent 执行者，HTTP `*ForAgent()` 仍是工具缝，不是浏览器执行链。

---

## 5. 验收标准对照（对照 v1.0 §11）

| 标准 | 观察期结论 |
|---|---|
| 写动作能找到唯一 AI 动作记录 | **满足**（Worker / HTTP 提交都先有动作再投影包） |
| 能挂 conversation / batch / attempt / contextManifest | **有则挂**。HTTP 无 attempt 时用 `runId` 顶重放键，不假造 attempt |
| 决策在写入之前，执行结果事后补全 | **满足**。执行失败补 `failed`，不另开动作 |
| DENY / REVIEW 有机器可读 reason | **部分**：`UNREGISTERED` / `TARGET_MISMATCH` / `OBSERVATION_PERIOD`。尚无细粒度 policy reason |
| 未注册或未授权 capability 不能绕过网关写 | **未注册：满足**。**Capability：观察期不拦** |
| User Permission 不降低 | **满足**（仍在 Guard / 领域服务）。网关尚未复用 actionKeys 做第二层拦截 |
| R3/R4 未确认不改财务事实 | **真空满足**：没有财务 AI 写路径 |
| Worker 重放不产生第二份有效 pending / 第二套业务编号 | **审核包：满足**（同动作重放、跨动作 pending 挡住）。财务编号尚未经动作身份 |
| 高风险多设备确认 CAS | **仍在审核包版本上**，不在动作表上 |
| 重复提出达阈值可阻止 | **不满足 / 不在本阶段**：只观测 |
| USER_CONTROL 下不静默覆盖 | **沿用旧版本与 pending**，无独立控制权状态 |
| ADR-0046 E2E 回归 | 观察期要求业务结果与接入前一致；全量 API e2e 仍归 CI |

---

## 6. 测试与可观测性

**已有（本地单元，不替代 CI e2e）**

- `ai-action.gateway.spec.ts`：未注册不到 `forward`、只读留痕失败仍读、写类无记录不 `forward`、目标错配、同 replayKey 找回、打转观测不拒绝、敏感正文不进动作记录
- HTTP / Worker 适配器各有接线测试
- `review-package.projection.spec.ts`：来源动作、pending 复用 / 拒绝

**v1.0 §12 / §14 仍缺**

- Policy 单元（R0–R4、permission、capability、fail closed 强制）
- 指纹阈值拦截测试（本阶段不该有）
- `agent-action:{id}` 与财务幂等冲突测试
- USER_CONTROL 抑制写
- 指标：`agent_action_total` 等均未埋点

---

## 7. 下一步（只列观察期之后仍成立的工作）

按 ADR-0047：在观察期稳定之前，**不要**把 AI 写路径扩到财务，也不要加环境开关「试切强制」。

建议顺序：

1. **Tracker 收口**：代码已在 `main` 的 `#336`–`#341`（及规格 `#335`，若视为观察期已交付）应关票或改成「观察期完成、强制另开」。
2. **观察期读数**：用 `ai_actions` / `ai_action_repeat_observations` 看分类、错配、打转是否符合预期；需要时再补结构化日志与计数指标。
3. **显式改动切强制**（新票，不是开关）：能力目录真正拦截；风险等级从记账变成决策；未知策略 fail closed。提交审核包必须保持 `review`，不得 `allow` 直写草稿。
4. **动作身份接入业务幂等**：写命令使用 `agent-action:{id}`（扩展 ADR-0017）。
5. **后置**：Action Review 改名、协作控制权状态机、客源/资源/财务目录、Mastra Adapter、CEL / 组织级策略后台。

---

## 8. 目标架构（未变）

```
Durable Workflow Layer
Conversation / Batch / Job / Attempt / ContextManifest
        ↓
Agent Runtime (Mastra)     ← 只提出，不做权威允许/拒绝
        ↓
AI 动作提案
        ↓
AI 动作网关  execute(proposal)
  解析 Actor / 目标 → 注册表 →（观察期：能力/风险/重复只记账）
  → 先持久化决策 → forward 才产生业务效果
        ↓
ALLOW / REVIEW / DENY
        ↓
Business Truth Layer
NestJS Domain Services → PostgreSQL
REVIEW 的确认面 = AI 阶段审核包（表单，不是聊天）
```

三层边界与 v1.0 / ADR-0047 一致。观察期已经把「提出什么」这条证据链接到现网 AI 建团；还没有把「该不该发生」从记账推进到强制。
