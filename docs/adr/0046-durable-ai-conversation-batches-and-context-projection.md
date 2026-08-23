---
status: accepted
supersedes-partial:
  - docs/adr/0043-ai-review-confirmation-on-form-not-chat.md
  - docs/adr/0045-material-parse-worker-and-chat-attachments.md
---

# AI 建团使用持久化会话批次、后台工作流与可审计上下文投影

> 本 ADR 记录 AI 建团竖切的可靠执行边界；会话与任务的平台注册关系由 [ADR-0048](./0048-conversation-first-agent-platform-and-framework-boundaries.md) 扩展为 `AgentConversation → AgentTask → 具体业务任务适配器`。下文的建团归属关系在迁移期间继续作为兼容实现，不再作为新增 Agent 业务的复制模板。

AI 建团允许 User 在一轮消息中附加需要较长时间解析的图片、PDF，未来还会包含 Word 等多模态资料。现有实现先启动模型、再由浏览器异步建档；解析完成后依赖页面轮询调用 `runAgent()`。这使首轮 Agent 必然可能看不到资料，页面关闭、刷新、API 重启、委托过期或第二设备打开后也可能永久停住。完整历史若直接回灌模型，还会把旧消息、旧工具结果和档案全文带入新会话，造成长加载、无关推理与额外 Token 消耗。

决定将**历史存档、可靠执行和当前模型上下文**拆为三个层次：服务端持久化完整会话事件；PostgreSQL 工作流可靠推进不可变输入批次；Context Builder 在每次 Agent attempt 前生成受预算和版本约束的模型输入投影。浏览器与 CopilotKit 只负责输入、状态和流式体验，不拥有执行生命周期。

## 会话、事件与批次

- `AiConversation` 是跨刷新、跨页面和跨设备稳定的会话身份，归属一个 AI 建团任务及其 creator User。关闭协助窗口不创建新会话或使其他设备的运行失效；重新进入任务默认加入最近一个未完成会话，User 也可显式新建、继续或放弃会话。
- 当前阶段继续保持 creator-only：除 `departure:write` 外，访问者必须是任务创建者。同一 User 的电脑和手机共同观察、操作同一服务端状态；同组织其他 User 的接手与代理审核另行设计。
- `AiConversationEvent` 按服务端 sequence 追加且不可变，保存已发送消息、Agent 最终消息、关键工具结果、批次状态、审核处置和错误；不保存模型隐藏推理。多设备同时发送按 sequence 排列，不使用共享可变消息或 last-write-wins 批次。
- 一次发送原子创建 `AiInputBatch`、User 消息及附件依赖。发送后消息和附件集合立即冻结；后续输入形成新批次并排队，不能随解析速度加入旧批次。Agent 原子认领 `conversationVersion = N`，只读取 sequence 不大于 `N` 的不可变快照。
- 批次显式经历 `waiting_for_materials → ready_for_agent → agent_running`，并终止或暂停于 `awaiting_user_input`、`awaiting_review`、`completed`、`failed` 或 `cancelled`。状态表保存每个资料依赖及失败原因，不再从浏览器状态或零散时间戳推断。
- Agent 追问时持久化问题并进入 `awaiting_user_input`。User 的明确回复创建新批次并以 `replyToEventId` 关联问题；提问前已经排队的消息不能自动冒充答案。

## 附件屏障与解析版本

- 同一发送批次附加的文件默认全部是必需输入。文件上传、建档和批次依赖先由服务端确认；所有依赖离开解析中状态且存在可消费版本后，批次才进入 `ready_for_agent`。不允许先用残缺上下文运行 Agent，再空消息续跑。
- 产品层不增加“已读取/未读取”来源状态。Sources 只展示文件信息、来源消息、`解析中 / 可用 / 解析失败` 和原件预览；Context Manifest 与读取回执内部记录实际进入模型的版本及摘录，用于容量、证据和诊断。大文件只可称为“解析完成/可供 Agent 使用”，不能声称 Agent 已完整阅读。
- 任一必需文件解析失败时，批次保持等待，由 User 选择重试失败文件、移除失败文件后继续，或放弃本批；Agent 不得静默忽略失败文件。
- User 在 Agent 认领前移除资料时，以事件从批次屏障删除依赖；已经开始的解析可继续形成当前会话来源，但结果不得自动注入该批次。认领后输入快照不可变，修改必须显式“停止当前处理并重新整理”。
- 每个批次固定 `materialId + parseResultVersion`。后续重新解析产生新版本，只能被新批次显式引用，或在停止并重组后替换；“曾在历史会话出现”不等于以后自动进入模型上下文。
- 放弃批次或归档会话不立即删除原件与解析结果；它们仍只归当前会话，新会话不能因为关联同一任务而引用。未来跨会话复用须经独立资源库显式选择；文件若通过业务命令成为正式领域附件，则按领域对象权限读取。物理删除由独立数据保留规则决定。
- 上传请求携带幂等键；同一会话内相同 SHA-256、大小和 MIME 的原件可复用逻辑来源与匹配解析版本，避免重复展示。跨会话仍建立来源、上下文和审核历史独立的逻辑记录；底层字节或解析缓存最多在同 Organization 且解析器配置版本一致时复用，不能因此让其它会话发现原件。

## PostgreSQL 后台工作流

- 第一阶段不引入 Redis/BullMQ。增加独立 `workflow-worker` 服务，使用 PostgreSQL 持久化并领取“资料解析”和“Agent 批次执行”等少数长作业；普通表单保存、审核处置及业务事务不进入队列。
- 作业只保存任务、会话、批次、档案及版本 ID，不复制文件字节、解析全文或完整 prompt。Worker 认领后从对象存储和数据库读取固定版本内容。
- Worker 通过 `FOR UPDATE SKIP LOCKED` 或等价原子认领维护 lease、heartbeat、expiration、attempt count 与 next attempt time；处理器采用“至少执行一次 + 业务幂等”，有限重试后进入可观察的失败状态。极端情况下允许重复 OCR 或模型调用及额外费用，但只能有一个审核包或业务结果通过唯一键/CAS 生效，其他 attempt 留痕并废弃。
- 同一任务同时最多运行一个 Agent 批次，其他批次按服务端 sequence 等待。一个 `workflow-worker` 进程承载两类 handler，OCR 与 Agent 使用独立、可配置的并发上限（默认各 2），不拆成两套部署；复杂的组织配额和公平调度待真实负载出现后再设计。
- Agent 作业认领后记录发起 User，并重新检查 User、Organization、feature 与 `departure:write`；校验通过后生成短期委托，不保存浏览器 token。资料解析作业不签发委托：Organization 停用则不再解析，发起 User 停用不阻止归档。权限已撤销的未执行 Agent 批次进入失败，由任务创建者重试或放弃，不引入 Platform Admin 作业控制台。
- 瞬时外部故障（网络、超时、无头或解析服务 5xx）回到 pending 并退避，与租约回收共用 attempt 上限；权限失效、用户取消与版本冲突立即终态。业务结果幂等继续用审核包唯一约束、对象版本和 CAS；不把 ADR-0047 的 AI 动作身份当作本阶段前置。
- 在线客户端通过 SSE 观察持久化事件和状态；HTTP 继续承担发送、取消、回复、失败批次重试和审核命令。流式 token 可以丢失，完成消息与业务事件不能丢失；客户端断线后按最后 sequence 补读，不重放模型执行。任务入口展示“解析中、AI 处理中、待审核、失败”等状态，恢复页面时只同步状态，不自动打开协助窗口或抢占焦点；第一阶段不做推送、短信或邮件通知。
- 第一阶段可观测性是 Worker 结构化日志（排队、解析/Agent 耗时、重试、失败、当前在途），不含资料正文、prompt 或候选；不建设队列管理页、Platform Admin 作业查询/人工重试 API，也不引入独立 metrics 后端。终态失败由任务创建者对同一批次点「重试」（不新发消息）；资料失败仍走「重试失败资料」。已取消、已放弃、待审核不可重试。

## 历史存档与当前上下文

- 历史 UI 可分页展示完整会话、档案引用、解析结果与审核记录，但查看历史不启动 Agent、不重新解析，也不把全部记录送入模型。显式继续旧会话时仍从最新任务事实重新构建当前上下文；新会话默认不继承旧消息或旧档案。
- 留存按数据性质分层：会话事件、任务、Action、审核记录、Context Manifest 及有硬上限的来源 locator/hash/短摘录属于权威小记录；上传原件、网页快照与生成文件存对象存储并随所属会话和审核引用保留；未被 Manifest/审核引用的旧解析缓存、OM observations/reflections、embedding、临时流式 Token 与详细 trace 可按 Organization 策略、TTL 和引用检查回收。归档不等于立即删除，任何 GC 都不得删除仍被审核、Manifest 或当前会话引用的版本；配合 User/Organization 额度、内容 hash 去重、对象存储生命周期和用量告警控制增长，具体天数不写死在领域模型。
- 模型调用观测长期保存输入谱系而不是完整内容副本：记录 Manifest/locator、Agent/Capability/System Prompt/Tool Schema/processor 版本、区段摘要/hash、实际 usage、Tool/Action 状态、耗时和安全结果摘要；最终 Agent 消息仍是会话事件。不长期保存每 step 完整 Prompt、完整 Tool Result、流式 Token 或隐藏推理；确需排错的脱敏片段仅在显式开关下限量保存失败调用并设置严格 TTL。
- Context Builder 以冻结后的 `inputBatchId` 和认领时的 `conversationVersion` 为边界，分别加载：本批消息与附件版本、当前表单及权限事实、未解决审核状态、显式固定的解析结果、当时有效的滚动摘要和必要的近期尾部，并应用单项与总 Token/媒体预算。当前 User 事件只作为本轮输入出现一次，必须从近期尾部排除；不得同时以历史消息和“本轮指令”重复注入。动态内容先完整组装再统一核算总预算，Context Manifest 记录各区段实际用量、裁剪原因和最终输入摘要；静态 System Prompt 与工具 Schema 单独计量并预留模型上下文空间，不能借“不属于动态投影”绕过整体容量边界。
- Token 容量采用三层控制：Context Builder 按业务优先级确定初始模型上下文并留下可复现的 Manifest；Mastra `TokenLimiterProcessor` 以保守上限作为每次模型调用和工具续步前的最后安全网，防止多步 tool result 令消息列表无界增长；供应商响应的实际 input/output/total Token usage 关联 attempt 与 Manifest 保存，用于运行观测和后续校准。当前 Mastra 估算基于启发式 `tokenx`，且主要覆盖消息列表，不能视为 DeepSeek 精确 tokenizer，也不能假设完整覆盖工具 Schema 或供应商协议开销。
- 每个模型版本使用独立容量配置：供应商上下文窗口扣除输出预留、System Prompt、Tool Schema、协议开销和安全余量后，才得到动态上下文预算；Context Builder 在较低软目标内按当前输入、HITL、任务/业务事实、近期尾部、压缩摘要、来源摘录与工具增量顺序分配。阈值不以统一字符常量写死，字符数只作为上传和日志快速保护；Manifest 保存各区段预算、实际用量和裁剪原因。
- Mastra 的通用消息裁剪不理解业务事实优先级，不得替代 Context Builder，也不得让 Manifest 声称模型看见了实际已被处理器删除的初始内容。正常情况下 Builder 应在保守上限内完成确定性裁剪；若最后安全网仍改变首次调用输入，必须在调用前把实际裁剪结果和最终输入摘要回写 Manifest，否则终止 attempt。工具续步产生的增量与处理器裁剪另记模型调用观测，不反向篡改首次输入 Manifest。
- 接近上下文软阈值不是正常失败条件。后台应提前把已归档的旧消息和冗长技术工具结果生成版本化 AI 上下文压缩版本；达到激活阈值后，用压缩投影替换模型窗口中的对应旧内容，并保留原始事件范围供受控回读。压缩结果记录覆盖 sequence、生成模型与配置版本、输入/输出摘要、Token 使用和生命周期结果；当前 User 输入、未完成审核、权限与安全约束、当前固定业务事实不得被静默压缩或删除。系统事实始终覆盖压缩投影，后者不能作为候选证据、授权或业务写入依据。
- 压缩版本后台预生成，Attempt 只固定覆盖范围不超过其 `conversationVersion` 的已完成版本。原始上下文仍在预算内时不等待压缩；确实放不下且合格版本尚未就绪时，InputBatch 进入持久 `preparing_context`，由 Workflow Worker 完成后再启动 Agent，前端展示整理进度。后台压缩失败但原文放得下不影响本轮；两者都不可用时进入可重试准备失败。Attempt 开始后不热换版本，也不先调用模型报超限再盲目改变上下文重试。
- 压缩版本只负责导航，原文通过 `conversation_history.read` / `conversation_source.read` 等登记的只读能力按 locator 回链；只允许当前 Conversation 的有限 sequence、页或区段，并施加单次返回预算、分页、敏感信息与 Prompt Injection 处理。每次回读形成关联 Attempt、Manifest 与 Action 的读取回执；进入审核证据时再由服务端核对版本、位置和精确摘录，不提供“恢复完整会话”工具。
- Mastra Observational Memory 的 Observer / Reflector、异步 buffering、reflection 与 retrieval 机制可作为技术会话压缩引擎做隔离 PoC，但不得接管 `AiConversationEvent`、Workflow Worker 或 Context Manifest 的单一真相。PoC 必须证明跨实例与 Worker 重启可恢复、压缩内容能绑定权威事件范围、错误 observation 不覆盖业务事实、最终模型输入仍可审计，并验证 DeepSeek 下的压缩率、保真率、延迟和额外费用；未满足前继续由服务端上下文投影控制生产输入。完整核查见 [`docs/research/2026-mastra-context-engineering.zh-CN.md`](../research/2026-mastra-context-engineering.zh-CN.md)。
- OM 仅压缩当前 Conversation 的旧 User/Agent 消息和可回读技术 Tool Result；`resourceId` 至少按 Organization+User 隔离，`threadId` 对应唯一 Conversation。Observation/reflection 记录覆盖 sequence、模型与配置版本、输入输出摘要、usage、原文 locator 和生命周期；当前 InputBatch、其它会话、Task/业务事实、权限、能力授予、Interaction、Review Package、候选证据与业务审计均不得交给 OM 维护。
- 第一阶段不启用模型可写 Mastra Working Memory。小团宝优先处理具体业务目标，Task 目标/阶段/开放问题、User 偏好、业务字段和待确认提案不得复制进 Task-scoped 或 User-global 模型记忆。未来只有出现明确收益，并设计 User 查看、纠正、删除和组织隔离后，才可对单 Conversation 做 Schema 受限、完整留痕的非权威 PoC；资源库与长期用户偏好记忆分别立项。
- 单条当前 User 输入自身超过压缩后剩余窗口时，不得静默截断，也不能期待 Observational Memory 在首次调用前自动解决。服务端先完整持久化原文，再按稳定区段进行分块抽取，以原文定位合并结构化结果；主 Agent 只接收合并结果和必要原文片段，授权、金额、日期、身份及其它决定性内容仍须回链原文核对。只有自动压缩、受控回读和超大输入分块流程仍无法完成时，批次才进入可恢复的容量失败并提示 User 拆分或结构化处理。
- 超长来源处理由 PostgreSQL Workflow Job 提供租约、generation、重试、取消和逐块进度；普通服务端 Chunker 按页、段、行或字符范围产生同版本可复现的 locator，Mastra 专用 extraction Agent 只按统一 structured output Schema 抽取每块语义，服务端 Reducer 校验 Schema/locator、去重并保留冲突候选，生成 versioned SourceIndex。Mastra Workflow 最多编排一次认领内的有界步骤，不承担跨进程恢复；模型不得自由切块、静默择一冲突或把抽取结果直接写入业务对象。
- 滚动摘要只承接交流背景，不能成为表单字段、审核结论或其他业务写入证据。系统事实优先于摘要。候选证据必须绑定产生它的同一 attempt 与 Context Manifest：User 消息须属于冻结事件引用，资料证据须属于固定的档案解析版本并能核对位置与摘录，系统推导须来自登记的确定性规则及已验证输入；模型自报的来源不具权威性。来源尚未进入该次冻结上下文时，必须先通过受控读取形成可审计引用，才能提出候选。
- User 消息证据的消息标识与 sequence 必须指向 Context Manifest 冻结的同一事件，摘录须匹配服务端原文。资料证据必须来自 Manifest 固定的 `materialId + parseResultVersion`：初始索引摘录可直接核对，定向读取则须形成关联 attempt、Manifest、资料版本、具体页或位置及返回内容摘要的 AI 资料读取记录。系统推导只允许登记的确定性规则，记录规则 ID、版本和输入证据，并由服务端重新计算输出；第一阶段只登记 `basic_info` 实际需要的少量规则。
- 模型提交的资料摘录和位置只是待核实引用，最终证据由服务端从固定解析版本生成。原生文本来源使用版本化的保守规范化规则匹配连续文本范围，并保留页内文字行或字符范围及可用的版面位置；图片与扫描 PDF 使用同一规则匹配该版本的 OCR 文字行，保留页码、命中文字行、视觉区域和识别质量提示。规范化只统一 Unicode 表达、换行和连续空白等排版差异，禁止字符改写、同义替换、编辑距离或语义相似匹配；证据保留规范化规则版本、服务端截取的原文位置与规范化内容摘要。图片按单页资料处理。未命中、存在无法消解的多处命中或无法映射到权威位置时，整包验证失败，不接受模型自报的字符区间或坐标。
- OCR 证据的真实性只表示候选与该固定解析版本的 OCR 输出一致且来源可定位，不表示 OCR 对原件内容的识别绝对正确。RapidOCR 输出的行分数属于 OCR 引擎质量信号，不是模型自评、业务正确概率或证据真实性结论；原生文本 PDF 不产生该分数。第一阶段尚无小团宝真实资料校准集，不设基于该分数的证据硬拒绝门槛：低质量命中仍可支持候选，但证据及审核区必须明确提示 User 对照原件。未来只有在积累代表性样本、确定跨行聚合方法并完成误拒绝/漏报校准后，才能另行引入版本化分级策略，且不得追溯改判既有审核事实。第一阶段将解析结果已有的文字行、坐标与 OCR 行分数提升为正式解析和证据契约，并由服务端生成稳定定位、规范化短摘录与内容摘要。审核区区域跳转和高亮可独立交付，不作为服务端证据真实性闭环的前置条件；在高亮交付前不得把“页码 + 摘录”描述成已具备视觉区域定位。
- 当前阶段不把原图或裁剪区域发送给视觉模型做二次识别。Agent 只消费固定解析版本的 OCR 文本及其来源信息；它可以基于业务上下文发现矛盾并提示 User，但这种语义判断不是图片复核，不能覆盖 OCR 原文、修改 OCR 分数或成为资料原文证据。是否引入按需视觉复核待真实使用情况另行决策。
- 资料正文读取成功而 AI 资料读取记录写入失败时，只读结果仍可返回并明确标记为不可作为候选证据；Agent 可用它回答当前问题，但必须重新读取并成功留痕后才能在审核提案中引用。证据预验证失败占用现有 AI 建团活动运行的工具调用预算，不另设重试计数；预算耗尽时不产生审核包，以明确的“提案无法验证”结果结束本轮。
- 大文件不得在每轮自动全量注入。未来资料能力采用“完整扫描形成结构化事实索引 + Agent 定向读取原文证据”的分层方式；具体 Word、图片和多模态解析策略不在本 ADR 中确定。
- 每次 Agent attempt 前持久化 `ContextManifest`，至少记录 conversation/batch/version、实际使用的 event sequence、summary/version、`materialId + parseResultVersion`、事实索引或片段 ID、表单/审核快照版本、system prompt/工具 schema/模型/Builder 版本、预算与裁剪原因及最终输入哈希。Manifest 只记录引用与装配规则，不复制隐藏推理或完整档案正文。

该边界参考 Codex 与 OpenCode 将完整 transcript 和 model-visible context 分离、通过 compaction/checkpoint 与近期尾部重建活动上下文的做法；源码证据与针对小团宝的差异见 [`docs/research/2026-agent-session-archive-and-active-context.zh-CN.md`](../research/2026-agent-session-archive-and-active-context.zh-CN.md)。

## 审核与聊天体验

- ADR-0043 的表单审核边界继续有效：Agent 只能提交持久化审核包，不能把候选直接写入发团创建草稿；查看、修正、确认与拒绝只在中间表单完成。聊天中的审核卡是 `awaiting_review` 状态展示，不是无效按钮，也不提供第二套确认入口。
- CopilotKit `useHumanInTheLoop` / `respond()` 不再承担业务暂停或可靠续跑。Agent 工具可在同一 attempt 内无副作用预验证审核提案并接收结构化错误，但只有 Worker 提交事务可以投影审核包；Worker 复验后将 AI 动作、审核包、完成消息与批次 `awaiting_review` 状态原子提交，随后结束 attempt。确认或拒绝由 User HTTP 命令写入持久化事件，并以审核包版本/CAS 保证首个处置生效；另一设备同步“已处理”，不能产生第二次续跑。
- CopilotKit 继续拥有 AI 会话的交互壳层。浏览器直接管理 Agent 时可使用 `CopilotChat`；本 ADR 的服务端持久化模式使用受控 `CopilotChatView` 及其默认 message/input/attachment Slots，将持久化事件、批次状态、文本草稿和发送命令适配为 `messages`、`isRunning`、`inputValue` 与 `onSubmitMessage`。浏览器不调用 `runAgent()`、也不经 `POST /copilotkit` 触发执行，这只改变执行所有权，不构成用普通 DOM 或 Ant Design 输入控件重做聊天界面的理由。
- 消息、附件、建议项、流式状态及工具调用展示应先使用 CopilotKit v2 组件、Slots、`useAttachments` 和 activity/message/tool renderer。只有框架扩展点无法满足已确认需求时才允许自定义，并须在 PR 中记录缺口与不可复用证据；Ant Design 继续负责表单、审核、业务状态和通用反馈。
- 确认后后台工作流可创建后续批次，重新读取最新任务事实并继续协作。拒绝表示本次候选作废且草稿未修改；系统等待 User 下一条明确指令，不追问、不自动重新生成。
- User 在表单修正候选值时，原证据只保留为 AI 原提案的依据；修正另行记录操作者、时间和前后值，不把修正值伪装成原资料识别结果。永久审核记录采用去重证据目录与候选引用：目录只复制稳定来源定位、内容哈希及有硬上限的短摘录，完整消息或资料正文继续由原始事实源持有；同一证据支持多个候选时只保存一次。候选数、单候选证据数、短摘录长度及整包 JSON 均须设服务端硬上限。
- 发送后立即显示 User 消息及持续更新的业务状态，例如“发送中、解析 1/2、正在整理、等待回答、等待表单审核”。解析期间不先生成没有实际内容的“已收到，稍后处理”。后台失败应在原位置提供重试失败文件、移除后继续或放弃本批等明确操作。

## 跨设备文本草稿

- 未发送的纯文本按 `conversationId + userId` 保存为服务端草稿，但不进入会话事件、历史、Context Manifest 或 Agent 上下文。CopilotKit 输入停止后防抖保存；服务端最后收到的完整文本为唯一事实（Last-Write-Wins）。
- 同一 User 多设备同时输入时，设备在持续编辑期间不应用远端变化；停止编辑后同步服务端最新文本。不提示冲突，不逐字符合并。
- 附件、录音及其他本地对象不跨设备保存。只有发送成功后，服务端档案引用才成为跨设备事实。
- 发送消息与清空草稿在同一事务中推进 `draftEpoch`；发送前产生但延迟到达的旧 epoch 请求不得复活已发送文本。发送失败则保留当前文字和本地附件供重试，也不得启动 Agent。

## Contract 收口（#323）

expand 阶段已把会话、批次、Worker、SSE 与 Context Manifest 落地。contract 阶段删除仍让浏览器拥有执行身份的旧缝，不新开 ADR，也不把 ADR-0047 动作网关并进本票。

- 打开协助窗只创建或恢复任务与 `AiConversation`；`assist-session` 只返回这两者。不创建 `AiCreateActivityRun`，不签发 AI 操作委托，不返回 `runId` / `delegationToken` / `expiresAt`。
- `AiCreateActivityRun` 仅在 Worker 认领已齐套批次时创建，是一次 Agent attempt 的外壳。attempt 到达已完成、等待 User 回答、等待表单审核或失败时结束该运行（实体仍为 `completed` / `failed`，暂停原因在批次）；等待审核期间不得保持 `running`。下一批次认领新建；租约回收未结束的 attempt 时复用原运行。审核包归属产生它的那次运行。不在本票删除或与 `AiAgentAttempt` 合并该实体。
- HTTP `*ForAgent()` 仍供无头 Agent 使用，但委托必须绑定 `running` 的 attempt，且与会话、批次、运行一致。缺 attempt 的开窗形态直接拒绝。浏览器不持有委托。
- Agent 进程唯一执行入口是 Worker 调用 `/v1/headless-runs`。`POST /copilotkit` 拒绝交互式执行；`GET /copilotkit/info` 可留作壳层发现。CopilotKit 继续作为受控 `CopilotChatView` 与附件 Slot，审核/工具提示投影自持久化会话事件，不依赖直播 toolCalls，也不把可执行 runtime 当第二执行者。
- CI 用确定性 OCR/Agent 的 API e2e 覆盖关页、刷新、第二设备、Worker 重启、解析失败、重试、拒绝与确认。一条 Playwright 冒烟走纯文字 → 待审核包 → 表单确认写入发团创建草稿 → 刷新后仍在，放在现有 `web-e2e`、本票不进 CI 门禁；真实 OCR/模型冒烟不进默认 CI，只写开发与运维边界。

## 第一阶段交付边界

- 当前仍处开发阶段，直接切换新数据模型；允许清理开发环境旧 AI 任务数据，不实现旧活动运行/聊天记录兼容读取、转换、灰度或浏览器/Worker 双执行模式。
- 以 `basic_info` 做纵向切片，一次打通“持久化输入批次 → 文件解析 Worker → 齐套唤醒 Agent → 持久化问题或审核包 → 刷新/跨设备恢复”。浏览器不拥有执行生命周期；`runAgent()` 与 CopilotKit 交互式执行均退出，不作为长期兜底。
- 完整历史会话入口、Word/多模态解析与事实索引、复杂队列管理后台、组织级配额及数据保留期限后续单独交付，但必须遵守本 ADR 的会话、批次、版本与上下文边界。

上下文工程按以下四张有顺序依赖的开发票交付，不合并成一次不可分辨的大改：

1. 修复当前 User 事件重复注入，让全部动态输入进入统一预算和 Context Manifest，并以最终组装结果验证裁剪与摘要。
2. 接入 Mastra `TokenLimiterProcessor` 与供应商实际 usage 观测，作为每次模型调用和工具续步的容量安全网；它不宣称具备自动摘要。
3. 建立版本化 AI 上下文压缩、激活状态与原文受控回读，并隔离验证 Mastra Observational Memory；PostgreSQL 会话事件、Workflow 与 Context Manifest 继续作为权威控制面。
4. 实现单条超大输入的原文持久化、稳定分块、带定位抽取与结构化合并，覆盖 Observational Memory 无法在首次调用前处理的输入形态。

前两张可先消除当前确定性缺陷并独立上线；第三张完成后才可宣称长会话具备自动上下文压缩，第四张完成后才可宣称单条巨型输入不依赖 User 手工拆分。任何阶段都不得把 TokenLimiter 的消息删除描述成 compaction。

## Consequences

- 页面关闭、刷新、切换设备、API 或 Worker 重启、长时间解析和短期委托过期不再使批次永久停住；系统能够回答每个批次在等待什么、使用了哪些输入、由哪个 attempt 处理以及为何失败。
- 聊天恢复不再等于全量回灌历史。完整存档可用于浏览和审计，模型输入保持可预算、可复现并以当前业务事实为准。
- 代价是新增会话事件、输入批次、作业、attempt、草稿和 Context Manifest 等持久化模型，以及独立 Worker、SSE 和运维观察面；但这些复杂度集中在 AI 长任务，不扩散到普通业务写入。

## Considered Options

- **继续浏览器轮询并空消息调用 `runAgent()`：** 实现小，但页面关闭、异常、token 过期或第二设备打开后没有可靠恢复，且前后端 at-most-once 标记会造成永久停顿。
- **发送文字后先让 Agent 回复，资料完成再补一轮：** 交互看似即时，但首轮上下文必然残缺，第二轮能否理解唤醒原因依赖隐式 prompt，也会浪费模型调用。
- **把全部历史、工具结果和解析全文恢复到聊天：** 历史可见性与模型输入混为一谈，导致上下文膨胀、旧事实污染与不可解释的 Token 消耗。
- **立即引入 Redis/BullMQ 或完整工作流平台：** 能提供成熟队列能力，但当前只有少数 AI 长任务，增加新的基础设施与运维面不成比例；PostgreSQL 持久化执行器足以建立可靠边界。
- **把所有操作都队列化：** 会扩大最终一致性范围；普通表单和审核命令继续使用同步事务，只有长耗时、可恢复的解析与 Agent 执行进入后台工作流。
- **多设备草稿做 CRDT 或弹出冲突选择：** 对同一账号的短文本草稿过度设计；LWW 配合发送 epoch 即可避免静默复活旧文本。
- **等待审核期间复用任务级 running `AiCreateActivityRun`：** 实现少，但「running」在无人执行时撒谎，开窗不创建运行也无法自洽。
- **#323 顺手落地 ADR-0047 或删掉 HTTP `*ForAgent()`：** 把执行所有权与动作治理绑成一张票；无头仍需要工具缝，网关观察期应另票包这条缝。
- **`POST /copilotkit` 继续作为第二执行口（即便要求 attempt 委托）：** 同一任务仍存在浏览器与 Worker 两个执行者。
- **把 Playwright `basic_info` 冒烟直接做成 `main` required：** 正确性已由确定性 API e2e 守；本票再给 CI 接 Web+Worker+确定性 Agent 矩阵会变成基础设施票。
