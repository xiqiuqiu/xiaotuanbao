---
status: accepted
supersedes-partial:
  - docs/adr/0043-ai-review-confirmation-on-form-not-chat.md
  - docs/adr/0045-material-parse-worker-and-chat-attachments.md
---

# AI 建团使用持久化会话批次、后台工作流与可审计上下文投影

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
- 任一必需文件解析失败时，批次保持等待，由 User 选择重试失败文件、移除失败文件后继续，或放弃本批；Agent 不得静默忽略失败文件。
- User 在 Agent 认领前移除资料时，以事件从批次屏障删除依赖；已经开始的解析可继续形成任务档案，但结果不得自动注入该批次。认领后输入快照不可变，修改必须显式“停止当前处理并重新整理”。
- 每个批次固定 `materialId + parseResultVersion`。后续重新解析产生新版本，只能被新批次显式引用，或在停止并重组后替换；“曾在历史会话出现”不等于以后自动进入模型上下文。
- 放弃批次或会话不删除原件与解析结果。档案继续归任务保存；新会话只有显式引用既有档案后才能使用。物理删除由独立的数据保留规则决定。
- 上传请求携带幂等键；同一任务内相同 SHA-256、大小和 MIME 的原件复用已有逻辑档案与匹配解析版本，避免重复展示。跨任务仍建立权限、解析和审核历史独立的逻辑档案；底层字节或解析缓存最多在同 Organization 且解析器配置版本一致时复用。

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
- Context Builder 以冻结后的 `inputBatchId` 和认领时的 `conversationVersion` 为边界，分别加载：本批消息与附件版本、当前表单及权限事实、未解决审核状态、显式固定的解析结果、当时有效的滚动摘要和必要的近期尾部，并应用单项与总 Token/媒体预算。
- 滚动摘要只承接交流背景，不能成为表单字段、审核结论或其他业务写入证据。系统事实优先于摘要；候选必须能追溯到明确的 User 消息、当前业务事实或固定档案解析版本。
- 大文件不得在每轮自动全量注入。未来资料能力采用“完整扫描形成结构化事实索引 + Agent 定向读取原文证据”的分层方式；具体 Word、图片和多模态解析策略不在本 ADR 中确定。
- 每次 Agent attempt 前持久化 `ContextManifest`，至少记录 conversation/batch/version、实际使用的 event sequence、summary/version、`materialId + parseResultVersion`、事实索引或片段 ID、表单/审核快照版本、system prompt/工具 schema/模型/Builder 版本、预算与裁剪原因及最终输入哈希。Manifest 只记录引用与装配规则，不复制隐藏推理或完整档案正文。

该边界参考 Codex 与 OpenCode 将完整 transcript 和 model-visible context 分离、通过 compaction/checkpoint 与近期尾部重建活动上下文的做法；源码证据与针对小团宝的差异见 [`docs/research/2026-agent-session-archive-and-active-context.zh-CN.md`](../research/2026-agent-session-archive-and-active-context.zh-CN.md)。

## 审核与聊天体验

- ADR-0043 的表单审核边界继续有效：Agent 只能提交持久化审核包，不能把候选直接写入发团创建草稿；查看、修正、确认与拒绝只在中间表单完成。聊天中的审核卡是 `awaiting_review` 状态展示，不是无效按钮，也不提供第二套确认入口。
- CopilotKit `useHumanInTheLoop` / `respond()` 不再承担业务暂停或可靠续跑。Agent 在持久化审核包、完成消息与批次 `awaiting_review` 状态原子提交后结束 attempt。确认或拒绝由 User HTTP 命令写入持久化事件，并以审核包版本/CAS 保证首个处置生效；另一设备同步“已处理”，不能产生第二次续跑。
- CopilotKit 继续拥有 AI 会话的交互壳层。浏览器直接管理 Agent 时可使用 `CopilotChat`；本 ADR 的服务端持久化模式使用受控 `CopilotChatView` 及其默认 message/input/attachment Slots，将持久化事件、批次状态、文本草稿和发送命令适配为 `messages`、`isRunning`、`inputValue` 与 `onSubmitMessage`。浏览器不调用 `runAgent()` 只改变执行所有权，不构成用普通 DOM 或 Ant Design 输入控件重做聊天界面的理由。
- 消息、附件、建议项、流式状态及工具调用展示应先使用 CopilotKit v2 组件、Slots、`useAttachments` 和 activity/message/tool renderer。只有框架扩展点无法满足已确认需求时才允许自定义，并须在 PR 中记录缺口与不可复用证据；Ant Design 继续负责表单、审核、业务状态和通用反馈。
- 确认后后台工作流可创建后续批次，重新读取最新任务事实并继续协作。拒绝表示本次候选作废且草稿未修改；系统等待 User 下一条明确指令，不追问、不自动重新生成。
- 发送后立即显示 User 消息及持续更新的业务状态，例如“发送中、解析 1/2、正在整理、等待回答、等待表单审核”。解析期间不先生成没有实际内容的“已收到，稍后处理”。后台失败应在原位置提供重试失败文件、移除后继续或放弃本批等明确操作。

## 跨设备文本草稿

- 未发送的纯文本按 `conversationId + userId` 保存为服务端草稿，但不进入会话事件、历史、Context Manifest 或 Agent 上下文。CopilotKit 输入停止后防抖保存；服务端最后收到的完整文本为唯一事实（Last-Write-Wins）。
- 同一 User 多设备同时输入时，设备在持续编辑期间不应用远端变化；停止编辑后同步服务端最新文本。不提示冲突，不逐字符合并。
- 附件、录音及其他本地对象不跨设备保存。只有发送成功后，服务端档案引用才成为跨设备事实。
- 发送消息与清空草稿在同一事务中推进 `draftEpoch`；发送前产生但延迟到达的旧 epoch 请求不得复活已发送文本。发送失败则保留当前文字和本地附件供重试，也不得启动 Agent。

## 第一阶段交付边界

- 当前仍处开发阶段，直接切换新数据模型；允许清理开发环境旧 AI 任务数据，不实现旧活动运行/聊天记录兼容读取、转换、灰度或浏览器/Worker 双执行模式。
- 以 `basic_info` 做纵向切片，一次打通“持久化输入批次 → 文件解析 Worker → 齐套唤醒 Agent → 持久化问题或审核包 → 刷新/跨设备恢复”。现有前端每 2.5 秒轮询并调用 `runAgent()` 的机制退出执行职责，不作为长期兜底。
- 完整历史会话入口、Word/多模态解析与事实索引、复杂队列管理后台、组织级配额及数据保留期限后续单独交付，但必须遵守本 ADR 的会话、批次、版本与上下文边界。

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
