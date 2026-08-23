# 会话优先的小团宝 Agent 平台与第二业务竖切

## Problem Statement

当前 Agent 能力围绕“AI 建团任务”形成了可运行的竖切，但产品最终目标是让 User 在统一会话中使用 Agent 处理整个小团宝业务，而不是把建团固化为 Agent 的顶层入口。现有模型要求会话、输入批次和执行尝试归属单一建团任务，界面缺少通用会话历史与全局模式，运行代码也仍混有建团专用状态。这会阻碍客源、财务、合作伙伴等领域复用同一套会话、权限、执行、审核和恢复能力。

User 需要一个以 Conversation 为入口的 Agent：既能进行无需 Task 的实时查询，也能创建和跨会话推进长期 AgentTask；所有业务事实仍由现有领域 API 提供，写操作经过审核、版本、权限、幂等与并发保护。侧边栏和全局 Agent 页面必须展示同一 Conversation，历史会话不能擅自改变当前业务页面，只有 User 显式点击业务结果入口才导航。

当前仍处开发阶段，因此不需要迁移开发期 Agent 历史数据。现有建团竖切应直接重构到新平台，开发环境可重置 Agent 运行数据，但不得删除或覆盖 Departure、客源、财务及已成为正式领域资料的业务数据。

## Solution

- AgentConversation 是单一 User 的私人交互空间，可以不关联 Task，也可以显式关联多个 AgentTask。
- AgentTask 表达需要跨轮次推进、等待、审核或恢复的长期业务目标；建团只是第一个 Task Type。
- 每次 User 输入形成不可变 InputBatch，并可显式引用、创建或主要服务于零到多个 Task；Attempt、Action、Interaction、Review Package 和 ContextManifest 共同形成 PostgreSQL 权威运行链。
- Mastra 作为可丢弃的 Agent 执行内核，通过版本化 AgentDefinition、CapabilityDefinition、类型化 RequestContext、Schema、Processor、Trace 和 Eval 运行；PostgreSQL/API/Worker 继续拥有权限、业务事实、持久 HITL、恢复与审计。
- CopilotKit/AG-UI 继续承担会话壳和结构化 Activity 呈现；侧边栏与全局模式复用同一 Conversation、草稿、事件和业务组件。
- 现有建团功能直接迁入通用平台；AiCreateTask 只保留为与 AgentTask 共享身份的建团领域扩展。
- 第二业务竖切选择无 Task 的“合作伙伴往来账款查询”，用三个只读 Capability 验证平台能够脱离建团复用。
- 会话只展示查询概览及有限预览；完整列表、筛选、排序和分页通过显式按钮进入正式业务页面。

## User Stories

1. As a User, I want to open the Agent from any permitted business page, so that I can ask questions without leaving my current work.
2. As a User, I want to start an unsaved new Conversation and only persist it after the first successful send, so that empty conversations do not pollute history.
3. As a User, I want to search and revisit my own Conversation history, so that I can continue prior work.
4. As a User, I want Conversation history grouped by recent activity, so that active discussions are easy to find.
5. As a User, I want switching historical Conversations to leave the current business page unchanged, so that reviewing chat history does not disrupt my work.
6. As a User, I want to expand the same Conversation into a global Agent page, so that I can work with more space without creating a duplicate Conversation.
7. As a User, I want to return from global mode to the prior business location with the same Conversation open, so that context is preserved.
8. As a mobile User, I want the Agent to use a single full-screen conversation layout, so that business content and chat do not compete in a narrow viewport.
9. As a User, I want a new Conversation created from a business page to include a removable current-page locator, so that the Agent can read the intended object.
10. As a User, I want historical Conversations to require an explicit “获取当前页面” action, so that hidden page context is not injected unexpectedly.
11. As a User, I want to ask ordinary questions without creating an AgentTask, so that the task list represents real long-lived goals rather than every message.
12. As a User, I want one Conversation to create and discuss multiple AgentTasks, so that a real workflow is not split into artificial chats.
13. As a User, I want one AgentTask to be continued from multiple Conversations, so that I can approach the same business goal from different discussions.
14. As a User, I want another Conversation continuing a Task to read the latest business object state, so that it does not inherit stale messages or attachments.
15. As a User, I want Task lifecycle updates displayed as structured activities in the Conversation timeline, so that I can understand progress, review requirements, success and failure.
16. As a User, I want failed executions explained in the Conversation and recorded as failed, so that I can decide what to ask next without a separate operations console.
17. As a coordinator, I want to create a Departure through the Agent and review proposed fields before applying them, so that AI assistance does not silently modify business data.
18. As a coordinator, I want to continue from a confirmed Departure into later goals such as SourceOrder completion, so that creating a Departure is one capability rather than the Agent product itself.
19. As a User, I want multiple Conversations to produce independent proposals for the same business object, so that one pending review does not block all other work.
20. As a User, I want stale proposals to report a version conflict instead of overwriting current data, so that concurrent work remains safe.
21. As a reviewer, I want every proposed value to retain its own evidence references, so that I can verify why it was suggested.
22. As a reviewer, I want my corrections recorded separately from model evidence, so that audit records distinguish AI proposals from human input.
23. As a User, I want uploaded files to belong only to the Conversation where I supplied them, so that attachments are not silently injected into unrelated Conversations.
24. As a User, I want uploaded files parsed automatically before their originating InputBatch runs, so that I do not need to manage a separate parsing state.
25. As a User, I want confirmed business facts to be available from other Conversations through domain APIs, so that sharing current truth does not require copying source files.
26. As a User, I want an attachment to become a formal business document only through an explicit domain action, so that upload does not equal business acceptance.
27. As a User, I want long Conversations to continue through deterministic context compression, locator rereads and bounded extraction, so that the Agent does not abruptly stop near the model window.
28. As a User, I want a single very large input processed through lossless chunked extraction when possible, so that capacity limits do not silently discard authoritative content.
29. As a User, I want to query a Partner by name or from the current Partner page, so that I can understand its current account position.
30. As a User, I want ambiguous Partner names presented as a persistent choice, so that the Agent does not guess the wrong counterparty.
31. As a User, I want Partner receivable and payable summaries calculated from current domain data, so that the answer reflects the latest business facts.
32. As a User, I want “全部有效”“未结清”“逾期应收”和“开放未付” to use stable server-owned meanings, so that financial wording is consistent with the product.
33. As a User, I want date ranges explicitly interpreted as Departure dates, so that a query is not silently changed into a due-date query.
34. As a User, I want a compact Conversation result showing the query time, scope and receivable/payable totals, so that I can understand the answer quickly.
35. As a User, I want at most the five most recently updated matching schedules previewed when I request details, so that the Conversation remains readable.
36. As a User, I want “查看应收明细” and “查看应付明细” buttons, so that I can open the full Partner ledger with the correct filters.
37. As a User, I want the formal business page to re-read current data after navigation, so that a historical chat snapshot is not mistaken for current truth.
38. As a User, I want an old query card to keep its queried-at snapshot, so that Conversation history remains meaningful.
39. As a User, I want an explicit refresh to append a new result rather than mutate the old one, so that changes over time are visible.
40. As a User whose permissions were revoked, I want historical sensitive result cards hidden on subsequent reads, so that old Conversations do not bypass current access policy.
41. As a User, I want unsent drafts and the active Conversation preserved across side/global mode changes and supported devices, so that view changes do not lose input.
42. As an Organization administrator, I want Agent capabilities constrained by module entitlement and current User permissions, so that the Agent cannot exceed normal product access.
43. As a platform maintainer, I want every read, propose and execute capability to pass through the Action Gateway, so that target resolution, authorization, audit and idempotency are uniform.
44. As a platform maintainer, I want model input separated from trusted RequestContext, so that User or model parameters cannot spoof Organization, User, Attempt or capability versions.
45. As a platform maintainer, I want AgentDefinition and CapabilityDefinition versioned in code, so that behavior is reviewable, testable and replayable.
46. As a platform maintainer, I want model-visible tools limited to the current authorized capability intersection, so that denied or unrelated tools are not disclosed.
47. As a platform maintainer, I want PostgreSQL records to remain the recovery and audit source even if Mastra traces disappear, so that framework state loss cannot corrupt business workflow.
48. As a platform maintainer, I want every Attempt, Action and tool step correlated to Definition/Capability versions, Token usage and stable errors, so that regressions are diagnosable.
49. As a platform maintainer, I want deterministic scenarios, human golden cases and calibrated model evaluation separated from hard business assertions, so that language quality cannot override permissions or accounting invariants.
50. As a developer adding another domain, I want to add a domain AgentDefinition, CapabilityDefinitions and adapters without changing the platform state machine, so that the platform genuinely scales beyond Departure creation.

## Implementation Decisions

- Conversation is the top-level private interaction object. It has its own owner, title, activity timestamp and `open / archived` lifecycle and does not require a Task.
- Conversation and AgentTask have an explicit many-to-many relationship with auditable link metadata. Task completion or deletion never deletes a Conversation.
- AgentTask is created only for long-lived goals requiring multi-turn progress, waiting, review or recovery. Ordinary queries and immediate governed actions remain taskless.
- Generic AgentTask and the Departure-specific AiCreateTask extension share the same task ID. AgentTask owns the common goal, type, owner and lifecycle; the domain extension owns Departure draft, phase and Departure linkage.
- InputBatch is the primary immutable unit of User intent and may reference zero to many Tasks with `primary / referenced / created` roles. Workflow Job and Attempt follow the InputBatch rather than a required Task.
- ContextManifest freezes actual Conversation version, Task references, business object versions, source versions, authorized Definition/Capability versions, budgets and prompt summary for each Attempt.
- Action uses server-resolved `targetKind + targetId + targetVersion` as its true business target. taskId is optional and is never the lock or uniqueness boundary.
- Review Package uses a common envelope plus a versioned domain payload. Multiple pending proposals may coexist; confirmation revalidates current target version, permissions, proposal hash, evidence and domain invariants.
- Candidate evidence remains attached to the candidate it supports. User corrections are separate reviewer inputs and never inherit model evidence.
- ConversationSource owns uploads, web results, tool results and generated files for one Conversation. InputBatchSource freezes the exact version used. Sources are not synchronized through Task.
- A source becomes a formal domain attachment only through an explicit authorized domain command. Cross-Conversation continuation reads the current business object, not prior source content.
- Current-page context is a server-validated locator attached to an InputBatch. It contains no DOM, screenshot, unsaved form state, client cache or permission assertion.
- Context capacity uses provider Token usage plus conservative estimation, a soft threshold, deterministic compression of older non-authoritative content, locator rereads, step-level limiting and lossless chunked extraction for oversized single inputs. Capacity handling cannot silently drop current commands, evidence or current business facts.
- PostgreSQL/API/Worker are the sole authority for Conversation, Task, InputBatch, Attempt/generation, Action, Interaction, Review Package, permissions, idempotency, recovery and outcomes.
- Mastra is the execution layer. The first platform phase introduces a versioned AgentDefinition registry, CapabilityDefinition registry, Agent factory, typed RequestContext, input/output/context Schema, Processor pipeline, Structured Output and usage/trace correlation.
- Capability authorization is the intersection of Agent declaration, task/object scope, current User permissions, Organization entitlement/policy and platform risk policy. The model cannot request additional capabilities.
- Every read, propose and execute capability enters the Action Gateway. Read actions are audited; propose actions have no business side effect; execute actions require the policy-defined confirmation, idempotency and version checks.
- Mastra Workflow is used only for bounded steps inside one Attempt. Persistent HITL ends the Attempt and is resumed through a new InputBatch/Attempt reconstructed from PostgreSQL.
- CopilotKit remains the Conversation shell. Ant Design remains the form, review and dense business-data UI. Current controlled messages use persisted Activity renderers; future AG-UI Tool Rendering may reuse the same components without changing authority.
- Side mode and global mode are two projections of the same Conversation. Side mode overlays the current business page; global mode has Conversation history navigation. Mobile uses one full-screen single-column Conversation.
- Switching Conversation history never navigates the business page. Explicit result actions may navigate; side mode keeps the Conversation open, while global mode exits to the target business page and restores the same Conversation in the side panel.
- Conversation query cards store bounded queried-at snapshots, re-check current permissions during projection, and never silently refresh. Explicit refresh creates a new InputBatch, Attempt, Action and result.
- Dense lists are not paginated inside Conversation. A compact Activity shows summary and, only when requested, the five most recently updated matching rows using the same deterministic order as the formal list.
- Partner ledger navigation uses whitelisted route search parameters for Partner ID, accounts tab, direction, Departure date range and supported balance/window enums. Amounts, natural-language results and permission claims never enter the URL.
- The second vertical slice consists of `partner.search.read`, `partner.ledger.summary.read` and `partner.ledger.items.read`. It uses existing Partner and PaymentSchedule services rather than direct database queries.
- Partner search returns minimum disambiguation fields. Summary returns server-calculated direction/source groups. Items returns only a five-row white-listed preview and total/truncation metadata.
- Partner ledger scope is server-owned: `all_active` includes non-closed/non-voided nodes including settled rows; `open_only` keeps positive unsettled balance; `overdue` applies only to receivables; payables expose open unpaid but no “overdue payable” label.
- The platform is rebuilt directly because the product is still in development. Development Agent run data is disposable; no backfill, dual write, shadow read or per-Organization migration is required.
- The old AI-create route may exist only briefly as a request adapter that writes the new structures. The new Conversation UI uses generic APIs; after cutover the old runtime models, routes and code are removed.
- Resetting Agent run data must not cascade into Departure, SourceOrder, finance records or formal domain attachments.
- Observational Memory is not part of the first delivery. A later PoC requires per-User/per-Organization isolation, two stable vertical slices, deterministic context engineering, traceability and A/B Eval.
- Free Agent Network, broad specialist handoff, MCP and Skills are not enabled by default. They require later evidence and cannot grant permissions or replace the control plane.
- Failures are persisted and shown in Conversation. Automatic retries are bounded. No separate operational retry UI or public retry API is introduced.

## Testing Decisions

- The primary acceptance seam is API/Worker E2E using the real Nest API, PostgreSQL, Workflow Worker, Action Gateway and domain services with the deterministic Headless Agent adapter.
- Browser acceptance uses a small number of Playwright flows against real Web/API behavior for side/global continuity, history, current-page context, query cards, permission-aware projection, business navigation and URL filters.
- Real model behavior is evaluated through versioned offline Eval using the real Mastra AgentDefinition, Prompt, Processor and Capability Schema.
- Model Eval never replaces server assertions for Organization isolation, permission, evidence validity, object versions, accounting amounts, idempotency or final business effects.
- Focused contract and unit tests are added only for pure seams that high-level tests cannot diagnose precisely, including Schema validation, Context Builder budgets, Gateway policy, result projection and deterministic financial-scope mapping.
- Tests assert externally observable state and business outcomes rather than private implementation details.
- Existing AI workflow recovery, queued input, durable review, multi-device Conversation, Partner ledger and Web smoke tests are the preferred prior art.
- Recovery fault injection covers Worker exit around claim/model/tool/outcome boundaries, stale generation, dependency timeout, permission revocation, object version changes, reconnect and context-capacity failures.
- Second-slice deterministic scenarios include unique/no/multiple Partner matches, fake or cross-Organization locators, revoked `/partner` access, all supported ledger scopes, unsupported due-date wording, truncated preview, changed business data, history restore and explicit navigation.
- A second vertical slice fails platform reuse acceptance if it requires Partner-specific fields or transitions in generic platform tables/state machines.
- Required repository verification remains layered: typecheck, permission-matrix checks for permission-surface changes, React Doctor for Web/shared changes, focused tests locally, API E2E in CI, and browser E2E for selected critical journeys.

## Out of Scope

- Migrating development-period Agent Conversation, Task, InputBatch, Attempt, Source or Review Package data.
- Deleting, rewriting or backfilling existing Departure, SourceOrder, finance or formal attachment business data.
- Implementing every Xiaotuanbao domain capability in this delivery.
- Creating or editing SourceOrder and finance records through the second vertical slice.
- In-Conversation pagination, page-size controls, exports or a duplicate finance workbench.
- A general cross-Conversation file library or Organization resource library.
- Visual-model verification; the current evidence boundary uses fixed OCR/text parse versions.
- Working Memory or long-term User preference memory.
- Production use of Mastra Observational Memory, free Agent Network or unrestricted specialist handoff.
- Broad MCP integrations or Skills that grant capabilities.
- A dedicated workflow operations console or public retry API.
- Replacing CopilotKit as the Conversation shell or replacing Ant Design business UI without a separately demonstrated framework gap.
- Production data migration or production rollout in this PRD.

## Further Notes

- This PRD synthesizes the decisions recorded by Wayfinder #353 and child discussions #354–#362.
- The selected visual baseline is prototype branch `codex/prototype-agent-conversation-a`; prototype code is reference evidence only and is not production implementation.
- CopilotKit business-query UI research concluded that Generative UI supports rich result components but does not provide a generic business-list pagination pattern; the product therefore uses compact Conversation summaries and explicit navigation to formal business pages.
- Formal implementation issues must be tracer-bullet slices and sized so one agent can normally complete each issue within one context window.
