---
status: accepted
---

# Agent 会话作为平台入口，并保持 Mastra、CopilotKit 与业务控制面分层

AI 建团只是验证项目 Agent 化的首个业务竖切，不是平台的最终边界。平台采用会话优先入口与独立任务模型：`AgentConversation` 是 User 与 Agent 协作的顶层交流容器，一个会话可发起或关联多个 `AgentTask`；任务从一个会话发起，但可由同一 User 在多个会话中继续，查询、说明等短交互则可以不创建长期任务。当前 `AiCreateTask → AiConversation` 的代码所有权与静态“AI 建团助手”是竖切阶段的实现形态，后续必须向 `AgentConversation ↔ AgentTask → 具体业务任务适配器` 迁移，不能让新增业务继续复制一套业务专属会话、事件、运行和工具基础设施。

## 框架与业务职责

- **Mastra 是 Agent 执行内核和能力装配层。** 统一承载版本化 Agent registry、服务端 Request Context、动态 instructions/model/tools/processors、类型化工具与结构化输出、单次运行内的模型/工具循环、运行 trace 与 eval；业务能力按领域和风险最小化装配，不长期停留在一个静态建团 Agent，也不向一个“万能 Agent”暴露全部工具。
- **CopilotKit 与 AG-UI 是 Agent 产品交互层。** 继续承载聊天 shell、消息与 activity/tool renderer、附件、输入、流式进度和跨页面一致的交互协议；侧边会话与全局会话是同一会话的两种视图，不因此建立两套历史或执行链。Ant Design 继续承载表单、审核、业务记录和高风险确认。
- **小团宝 API、PostgreSQL 与 Workflow Worker 是业务控制面和单一真相。** 它们拥有会话事件、任务状态、输入批次、租约与恢复、权限、Context Manifest、持久化 HITL、Action Gateway、证据、幂等和业务事务。Mastra Memory、Workflow、interrupt、trace 或 CopilotKit thread 均不能替代这些权威事实。

## 权威执行链

所有 User 输入与命令先进入小团宝 API，并在 PostgreSQL 中形成不可变会话事件、输入批次及必要的持久作业。Workflow Worker 是唯一唤起 Agent 执行的生产入口：它认领作业、重新检查当前权限与状态、建立 Agent Attempt 和 Context Manifest，再调用 Mastra。无任务查询与即时操作可以不关联 AgentTask，但不能绕过这条持久执行链形成浏览器或 AG-UI 的第二执行入口。

Mastra 的模型调用、工具循环、Request Context、processor 与 attempt 内技术编排均属于可丢弃的执行运行态。进程崩溃时不恢复旧模型调用栈、Memory thread 或框架 Workflow 状态；Worker 根据 PostgreSQL 权威状态建立新 Attempt，并重新读取权限、任务和最新业务事实。Mastra 不直接写会话、任务、批次、交互、审核包或业务表。

Agent 最终消息、任务创建提案、持久追问、审核提案和批次结果以结构化 outcome 返回 Worker，由 Worker 在权威事务中提交。Agent 发起的读取与业务操作只能经 API 的 Action Gateway 和领域服务执行，写操作必须获得稳定 Action 身份、执行幂等和领域事务；Mastra 工具成功不能被解释为平台状态已经提交。

CopilotKit/AG-UI 与浏览器只维护可从持久事件重建的交互投影和临时流式内容。发送、停止、回答、审核等动作提交服务端命令；断线后按服务端 sequence 补读。流式 Token 可以丢失，Agent 最终消息、交互、审核与业务状态不能由客户端聊天数组、CopilotKit thread 或内存 runner 回写为事实。

平台的分布式执行保证是“至少执行一次 + 执行权代次 fencing + 业务幂等”，不承诺外部模型、OCR 或工具恰好调用一次。持久作业每次有效认领获得单调递增 generation；heartbeat、短期工具委托、Agent 动作和最终提交都必须验证当前 generation。租约过期、被新 Worker 接管、停止或取消后的旧 generation 及迟到结果不得推进权威状态。稳定 Action 身份和领域命令幂等负责让重复技术调用最多形成一个有效业务结果；重复费用与运行轨迹可以保留。

运行序列以 Conversation 而不是 Task 为边界：同一 Conversation 同时至多存在一个执行中的 Agent Attempt，后续 InputBatch 按服务端 Conversation Event sequence 认领；不同 Conversation 可以并行，即使它们关联同一 AgentTask 或业务对象。进入 `awaiting_review` 或 `awaiting_user_input` 时当前 Attempt 已到达持久终态并释放运行权，等待对象通过 Review Package 或 Interaction 独立存在，不锁住 Conversation、Task 或目标对象；后续普通消息可以形成新 InputBatch，只有明确回复某个等待对象的命令才能处置它。

一次 attempt 的最终 Agent 消息或持久交互/审核包、相关 Agent 动作、输入批次结果、Attempt/Job 终态和任务活动投影必须由 Worker 重新校验并在一个权威事务中提交。Mastra 的审核工具只可返回副作用为零的提案或预校验结果；不得像当前过渡实现那样先经 HTTP 创建审核包、再由 Worker 二次投影。这个双写窗口是必须在平台迁移中消除的现有缺陷，而不是目标架构的兼容语义。

每个逻辑业务命令使用稳定 Action 身份贯穿决策、执行、重试和结果。若进程在业务效果已经产生、Action 结果尚未落库时崩溃，重放必须根据领域幂等结果或外部回执对账并完成原 Action，不得创建第二个效果；能够同库提交的状态共享事务，外部副作用使用 outbox、回执、补偿或显式对账。Action Gateway 的登记记录本身不等于 execute-once。

Action 身份按风险语义生成，不由 taskId、ActivityRun、Attempt 或 generation 充当业务幂等键。只读调用按 Attempt 与 Tool 调用形成可重复的审计 Action；提案使用 `inputBatchId + capabilityVersion + resolvedTarget + proposalHash` 识别同一逻辑提案；审核后的执行使用 `reviewPackageId + reviewVersion + decisionCommandId` 识别同一确认命令。Worker 重试或 generation 接管必须查找并继续原逻辑 Action，相同输入在目标、参数或提案内容变化后才建立新 Action。第一版不向模型开放无需审核的即时写 Capability；未来启用前必须为该 Capability 单独定义服务端持久化的稳定命令身份、重复语义和领域幂等契约。

Action 审计与业务效果具有不同的回滚语义。稳定 Action 记录必须保留模型提议、服务端解析出的真实目标、generation、权限/策略决策以及执行结果或拒绝原因；业务事务失败或回滚不得同时抹去失败、拒绝、冲突或取消记录。写操作无法可靠建立审计时 fail closed；只读操作只有在服务端预先定义的降级策略下才可继续，并必须告警且形成可补偿的审计缺口，不能由模型或前端自行决定。

停止本次运行、取消等待项与关闭任务是三个不同的服务端命令。停止只针对当前 InputBatch/Attempt：先在服务端事务中使当前 generation 失效并持久化批次取消状态，再尽力 abort Mastra 调用，不关闭 Conversation、AgentTask 或已经持久化的 Review Package/Interaction。取消等待项只取消指定 Interaction 或 Review Package，不关闭 Task。关闭 AgentTask 是 User 对长期目标的显式决定，必须终止或隔离该 Task 尚未完成的批次、等待项及迟到 Action，但不删除关联 Conversation 或回滚已经提交的业务事实。所有迟到工具、Action 和 outcome 都在提交边界重新验证 generation。浏览器停止、连接断开或运行时 abort 只用于及时释放资源，不能作为隔离保证；关闭或隐藏 Agent 面板不触发任何停止、取消或关闭命令。

重试按错误语义分层：Mastra 可在单个 attempt 的预算内处理无独立业务副作用的模型瞬时失败、Schema 纠正和证据预校验；Worker 只为可恢复基础设施失败创建新 Attempt。权限拒绝、取消、过期版本、业务并发冲突及需要 User 输入的校验结果进入明确的失败或等待状态，不自动重跑。持久作业只有在其全部权威后处理已经原子完成，或剩余步骤已交给可恢复的 continuation/outbox 作业后才能成功；不得用“作业成功后 best-effort 固定资料或推进批次”维持业务链。

持久 HITL 不恢复旧 Mastra 调用栈。Agent 需要 User 补充信息或审核时，Worker 在同一事务中保存最终 Agent 提问或审核提示、结构化 Interaction/Review Package、输入批次等待状态以及 Attempt/Job 终态，随后结束本次运行。User 通过 API 以 `interactionId/reviewPackageId + version` 提交回答、修改、确认、拒绝或取消；首个有效命令形成新的不可变事件和输入批次，并由新 Attempt 在最新权限及业务事实下继续。Mastra suspend/resume 可以用于单次进程内的技术编排，但不得承载跨请求、刷新、设备或进程的业务等待。

Context Manifest 冻结本次 Attempt 的会话、资料、启动业务快照、指令与工具装配基线，并记录 processor 处理后各模型 step 的实际输入摘要和 usage；它是审计边界，不是把业务对象锁定到运行结束的数据库快照。Agent 后续经 Action Gateway 调用业务读取工具时，API 返回当前最新对象及版本并形成关联 Action、Attempt 与 Manifest 的读取回执；写命令携带预期版本，由领域服务以 CAS 或锁重新验证。若对象在读取后被其他 User 或任务修改，返回显式冲突并由 Agent 重新读取、调整方案或请求 User 决策，不能以旧 Manifest 覆盖新业务事实。

权限同样是实时业务事实，不由 Context Manifest、Mastra Request Context 或短期委托冻结。API 在 User 命令入口验证会话与任务访问权，Worker 认领时重新验证 User/Organization/任务与所需能力，Action Gateway 每次按服务端解析出的真实目标鉴权，领域服务在业务事务提交时再次校验权限、版本与不变量，User 回答或审核处置也按当时权限处理。权限在运行中被撤销后，后续读取或写入应被拒绝；此前已经合法提交的业务事实不因此自动回滚。

框架状态与控制面状态不做双主合并。PostgreSQL 中当前 Job、generation、Attempt、Interaction、Review Package 和事件 sequence 裁决恢复方向：Mastra 仍运行而控制面已终止时尽力中断并拒绝其迟到结果；控制面仍可执行而运行内核已丢失时，租约回收后由 Worker 建立新 Attempt；CopilotKit/AG-UI 过期时从持久事件和当前交互状态重建。Mastra 的 trace、memory、workflow 与 CopilotKit thread 只用于技术运行或诊断，不能因时间更新较晚而反向推进批次、任务或业务对象。

自动重试与必要的 Action 幂等对账耗尽后，Job、Attempt 与输入批次进入明确失败终态，并在会话中形成 User 可见的失败事件，说明失败阶段、已知业务结果和正常继续方式。继续操作只能由 User 通过普通会话重试或重新发送形成新的 InputBatch/Attempt；平台不建设直接修改 Job/Attempt、强制重放工具或绕过任务生命周期的专用运维恢复界面/API。外部结果未知时仍须由系统内部利用稳定 Action 身份和回执自动对账，不能把未知效果虚报为“确定未执行”。

## 跨会话连续性与来源边界

同一 User 可以在多个会话中继续一个 Agent Task，但会话之间不复制或自动发现消息、上传附件、网页查询、工具结果和生成文件。跨会话连续性只携带任务目标、活动摘要、业务对象引用和必要开放问题；新 Attempt 通过领域能力读取最新业务对象，而不是用旧会话来源恢复业务事实。会话来源只供产生它的会话、Context Manifest、审核证据和历史回看使用。未来若建设资源库，历史文件也必须由 User 显式选择进入当前会话；本阶段不提供跨会话历史文件搜索。

文件只有经正式业务命令成为合同、发票等领域附件后，才作为业务对象的一部分被其它会话按业务权限读取；这不建立通用 `AgentTaskMaterial`。当前 `DepartureMaterial.taskId` 和上传即任务资料是 AI 建团竖切的过渡结构，平台迁移时应改为 conversation/input-batch source 与版本化解析引用，不能提升为所有 Agent 任务共享资料的模型。

Review Package 同样属于产生它的 Conversation、InputBatch、Attempt 和 Action，并绑定目标对象基准版本与 write set；它不是任务级锁，也不以 Task/阶段全局唯一。会话 A 等待审核时，会话 B 仍可排队、读取最新事实并产生自己的提案。第一版确认任一包时由领域服务严格复验当前版本：版本未变才可提交，版本变化一律返回 stale/conflict；只有 User 后续显式发起重新生成，系统才从最新事实创建新包，原包保持冲突历史且不改写。字段未重叠不构成通用安全合并证明，因为领域不变量可能跨字段成立。未来若某一 Capability 需要安全合并，必须通过独立决策登记版本化 write set、一致性字段组、领域合并策略及并发测试后显式启用；平台默认仍为严格冲突。确认后跨会话共享的是新的业务事实，不是原会话的来源集合。

确认命令遇到版本冲突时不得自动调用模型或静默创建替代提案。Conversation 追加持久化冲突 Activity，展示目标已变化及可安全披露的变化摘要，并提供“基于最新状态重新生成”显式动作；User 点击后才创建新的 InputBatch/Attempt，重新读取当前事实并生成新的 Review Package。原包保持 `conflict` 历史状态，不原地更新为新版本。

每次 Attempt 的默认上下文由 Context Builder 按业务优先级确定性装配：平台安全与能力约束、当前 InputBatch、当前回复所关联的 Interaction/Review Package、Task 目标/阶段/活动摘要/业务对象引用、领域 API 读取的最新事实与版本、当前会话开放问题及必要近期尾部、当前会话版本化摘要、本批明确引用的会话来源。其它会话消息、来源和待审核包、完整历史、页面未保存编辑及无关业务字段均不默认进入；页面只提供 locator 和交互语境。Mastra processors 只处理每次模型调用的技术安全与容量，不能改变该业务优先级或让 Manifest 与实际输入失配。

## 会话视图模式

业务页右侧 Agent 面板与全局 Agent 页面是同一 `AgentConversation` 的两种路由视图。侧边栏点击放大导航到 `/agent/conversations/:conversationId` 并保存完整业务 `returnLocation`；全局页点击缩小返回原 pathname、search、Tab/筛选状态并展开同一会话。消息、草稿、执行状态和滚动锚点从同一服务端/客户端会话投影恢复，不创建新的 Conversation、InputBatch 或 Attempt。没有有效返回位置时缩小回工作台或最近有效业务页面；不使用无URL的全屏Overlay或新浏览器标签页承载主流程。

侧边栏的会话切换与业务导航解耦：选择任意历史 Conversation 只替换聊天投影，当前业务页面、Tab、筛选和未保存编辑保持不动，也不自动把该会话关联当前业务对象。会话头部不展示“上次业务位置”或返回链接，业务导航交给 User；侧边栏不按当前页面过滤全部历史。查看历史不会启动 Agent，是否携带当前页面 locator 由下一条消息的页面上下文规则决定。

第一版不做自动上下文感知。User 从业务页新建会话时，Composer 默认展示可移除的当前页面 Context Chip，首个 InputBatch 携带服务端可验证的 page/object/section locator；切换历史会话后不自动带入当前页面，只提供“获取当前页面”操作，点击后才为下一批次附加。locator 不包含 DOM、截图、未保存表单值、前端缓存或权限声明，不永久改变 Conversation；API 据此重新解析真实目标并通过 Capability 读取最新事实。未来自动感知另行原型和决策。

“新建会话”先进入未持久化空白态，不立即产生数据库记录或历史项，也不弹窗要求命名。首次有效发送时，服务端在同一事务中创建 Conversation、User Event 和 InputBatch；未发送即切走不留空会话。跨设备会话草稿从 Conversation 建立后才生效，首次发送前的临时输入只属于当前浏览器。

会话首次发送成功后先从首条 User 消息确定性截断出临时标题；首轮 Agent 完成后可异步生成更清晰的短标题，失败不影响会话。User 可以重命名，一旦存在 User 标题系统不再自动覆盖。标题只服务历史识别与搜索，不进入 Task 目标、业务事实或候选证据。

历史会话使用同一服务端数据源与同一当前会话状态，但按承载空间投影为两种密度：侧边栏点击会话标题打开轻量浮层，提供搜索、分组历史和醒目的“新建会话”；全局 Agent 页使用常驻左栏提供相同能力，右侧承载当前聊天。侧边栏不在固定宽度面板中再嵌套常驻全高导航，也不把历史拆为独立管理页面；任一视图切换会话后，另一视图恢复时保持同一选择。

历史列表默认按最近活动时间倒序，以今天、昨天、最近 7 天和更早分组，并使用服务端游标分页。第一版搜索当前 User 的会话标题和 User 消息正文；归档会话默认隐藏，仅在显式筛选后出现。附件 OCR/解析内容、Agent 回复、任务结果及业务数据库不进入第一版会话搜索，后续若扩展必须分别定义权限、索引和结果语义。

会话历史导航只管理 Conversation，不并列 Task，也不提供“新建 AI 建团任务”等领域专用一级入口。Task 创建、等待审核、完成和失败等状态以结构化活动卡片进入相关会话的消息时间线；会话头部可以提供进行中任务的紧凑定位入口。同一 Task 在多个会话中被继续时，各处按同一 taskId 投影最新状态而不复制任务；建团、客源、财务只是可扩展的任务类型。失败直接在活动卡片和对话中说明，不另设专用运维页面或重试 API。

侧边栏头部以会话标题及下拉箭头打开历史浮层，`＋` 进入未持久化新会话，放大进入同一会话的全局路由，`×` 只隐藏面板而不归档会话或取消任务。全局页的新建和搜索只放在左侧历史栏；左栏顶部按钮仅折叠导航，右上缩小按钮返回保存的业务位置并在侧边栏恢复同一会话，无有效返回时回工作台。折叠导航与退出全局模式必须使用不同可访问名称和 Tooltip，不能仅依赖相似图标传达语义；视图控制不丢弃适用范围内的未发送草稿。

窄屏下两种承载共用全屏单栏会话布局：从业务页呼出时以全屏抽屉覆盖并在关闭后原样恢复业务页面，直接访问全局路由时保留路由及 returnLocation 语义。历史导航改为临时左侧 Drawer，任务卡片、审核包和 Composer 纵向排列；因为侧边视图已占满屏幕，隐藏没有视觉增益的放大按钮。第一版不在移动端并排业务页面与 Agent，也不维护两套不同的移动会话组件。

交互原型最终选择方案 A“轻盈会话”作为首版视觉基线：使用中性背景、克制边框与阴影及充分留白，让会话内容保持主视觉；Task 与 Review Package 仍以时间线内的结构化卡片表达，不升级为独立控制台。方案 B 的高密工作台与方案 C 的任务推进台只作为探索证据保留，不进入正式实现；正式 UI 继续遵守 Ant Design 业务组件与 CopilotKit 会话壳边界。

## 现有 AI 建团迁移接缝

当前仍处开发阶段，开发期 Agent 任务、会话、批次、来源、Attempt、Action 与审核记录不构成必须迁移的历史资产。本次采用逻辑上的新架构切换，不编写历史回填、双写、shadow read 或按 Organization 迁移机制。先定义通用模型和契约，再把现有建团竖切迁入唯一的新 Worker、Gateway、Review 与审计链；验收后直接移除旧运行链，不能为了开发数据保留第二套平台。

落表采用原位泛化而不是建立平行 `Agent*` 表族：现有会话、批次、作业、Attempt、Action 等语义仍通用的控制面表直接移除建团专属外键和约束，并可在同一次开发期切换中按领域术语重命名；只为当前缺失的 AgentTask、会话任务关联、批次任务引用和 ConversationSource 等概念新增模型。代码、契约和文档统一使用 `AgentConversation`、`AgentTask`、`InputBatch`、`Attempt`、`Action` 等领域术语，物理旧表名不得继续决定领域所有权。切换期间不得存在两套可写会话或 Worker 链。

开发环境允许通过迁移或重置清理旧 Agent 运行数据，但清理边界只限 Agent 控制面及未被领域引用的临时来源。`Departure`、客源单、财务记录等正式业务对象，以及已由领域命令接收的正式附件或审计记录，不得被 Agent 表的清理级联删除、覆盖或回滚；必要时仅解除旧 Agent 关联并保留业务对象。

通用 AgentTask 与 `DepartureCreationTask` 采用共享主键的一对一身份。新建建团任务时原子创建 AgentTask 和 DepartureCreationTask 领域扩展；AgentTask 保存 Organization、Owner、版本化 Goal、Task Type 与通用生命周期，DepartureCreationTask 只保存建团 phase、DepartureCreationDraft 与 departureId。当前 `AiCreateTask` 通过开发期原位改造或重命名成为该领域扩展；新领域任务只创建 AgentTask，不建立空建团扩展，也不为开发期旧任务生成 ID 转换表。

会话与任务只通过 AgentTaskConversation 多对多关系连接，至少保存 conversationId、taskId、linkedAt、linkedByUserId 与 linkReason，并唯一约束 `(conversationId, taskId)`。AgentConversation 拥有标题/标题来源、Owner、最近活动和 `open / archived` 生命周期，不再持有必填 taskId；现有 `AiConversation` 原位泛化为该模型，而不是与新表并行。Task 删除或关闭不得删除 Conversation；旧 taskId 和旧状态不回填、不双写，新架构启用后直接停止使用。

通用运行链改以 Conversation 与 InputBatch 为主轴，不再要求每次输入先归属单一 Task。InputBatch 创建时可以尚未关联 Task，并通过 `AgentInputBatchTask` 以 `primary / referenced / created` 角色显式关联零到多个 AgentTask；关联只记录本批次实际使用或产生的任务，不能从 Conversation 当前关联反向推断。普通查询、目标澄清和即时操作不为满足外键而创建空 Task。

WorkflowJob 只归属 InputBatch；AgentAttempt 只沿 Job、InputBatch 与 ContextManifest 建立运行身份，不再强制 `taskId` 或 `activityRunId`。现有对应 `Ai*` 运行表原位泛化；`AiCreateActivityRun` 不进入新平台模型，User 可见任务活动改由会话事件和 Task 状态投影表达。Worker 以 conversationId 排除同一会话的并行 Attempt，不再以 taskId 排除不同会话执行。ContextManifest 冻结本次实际 `taskRefs`，至少包含 taskId、目标版本、状态版本及其来源，同时继续记录实际读取的业务对象版本；Task 在后续变化不改写历史 Manifest。

Action 的 taskId 保持可选，真实作用目标以服务端解析的 `targetKind + targetId` 及目标版本为准。通用 Review Package 归属 Conversation、InputBatch、Attempt、来源 Action 与真实目标对象，taskId 仅在该提案确实服务于某一 Task 时作为引用，不作为唯一性、并发锁或确认边界。AiCreateActivityRun 及各运行表旧必填 taskId 不进入新平台契约，建团竖切迁完后随旧运行链删除。

附件与工具读取结果迁移为会话私有的 `ConversationSource`，保存来源类型、存储定位、解析状态和不可变解析版本；上传到会话的内容立即进入解析，但不会因为多个 Conversation 关联同一 Task 而跨会话同步。`InputBatchSource` 固定本批次实际使用的 sourceId 与 parseVersion，审核证据继续引用固定版本、页码或区域，后续重新解析不得改写历史证据。

新上传内容直接写入通用 Source 与批次固定关系，现有 `DepartureMaterial` 与 `AiInputBatchMaterial` 的开发期记录不回填。其他会话继续同一 Task 时只读取领域 API 返回的最新业务事实，不复制原会话附件、消息或解析内容。

上传和解析本身不使来源成为 Task 资料或领域正式资料。只有 User 确认后的领域命令明确需要保存附件时，领域服务才建立自身的资料/附件记录并引用或复制受治理的源对象；该动作服从业务权限、对象版本、幂等与审计。建团领域可暂时保留 DepartureMaterial 作为这一领域记录或兼容适配器，但平台层不得把它泛化为所有 Agent 来源，也不建立通用 Task 级资料池。

通用审核采用“审核信封 + 版本化领域载荷”。信封固定 Conversation、InputBatch、Attempt、来源 Action、`capabilityKey + capabilityVersion`、`targetKind + targetId + baseVersion`、提案内容 Hash、状态及审核身份和时间；领域载荷由 Capability 对应的不可变 Schema 定义候选、逐项证据、write set、一致性分组和必要的冲突语义。平台不设计覆盖建团、客源和财务的万能字段数组，也不让审核包绕过领域适配器直接修改业务表。

同一目标可以由不同 Conversation 或 InputBatch 同时产生多个待审核包，不按 Task 或目标建立全局 pending 唯一约束。确认时服务端重新解析真实目标并读取最新版本，复验 User 权限、Organization 范围、提案 Hash、证据与领域不变量；第一版 baseVersion 不匹配时一律将该包标记或投影为 conflict，由后续新 InputBatch 基于最新事实重新提案，不能静默覆盖或按字段自动合并。确认操作直接提交已审核的同一载荷，不再要求模型生成 execute 参数。

每条候选与其 evidence 保持结构化归属，不能在审计记录中拍平成无法追溯到字段的数组。User 对候选的修正作为带审核 User、时间与原值/新值的独立输入保存，其来源是本次人工审核，不沿用或伪造模型原 evidence；最终提交值仍可回溯到原提案与人工修正。

现有 `AiReviewPackage` 的开发期记录不回填；其 `basic_info_draft` candidates 契约重构为一种版本化建团载荷。建团能力迁到通用审核信封并通过确认、冲突与审计测试后，删除旧包对 taskId、draftVersion 与固定 confirmationUnit 的平台级依赖，不保留长期读取适配器。

新平台 API 是唯一执行入口，新会话 UI 只调用通用 Conversation、InputBatch、Task 与 Review 契约。现有 `/ai-create-tasks/*` 路由仅可在前端切换的短窗口内把旧请求映射为同一通用命令，并且只写新结构；新 UI 接通后立即删除。迁移不实现新旧状态双写、影子读取、历史回滚或按 Organization 切读，新增客源、财务等能力也不得接入旧路由。

执行顺序固定为：先完成新模型与契约及数据库边界，再实现通用控制面和建团领域适配器，随后用全新 Agent 数据验证建团正常、审核、冲突、失败、恢复及证据链，接通新会话 API/UI，最后删除旧运行模型、路由和代码。验收必须证明会话可关联零到多个 Task、同一 Task 可由不同会话继续、多个审核包按目标版本解决冲突、Worker/Gateway/HITL/审计只有一套，并且第二领域无需复制 `ai-create-*` 基础设施。

## Mastra 能力采用边界

平台以服务端版本化 `CapabilityDefinition` 作为能力注册、选择和治理的权威单位，而不是以 Mastra Tool、HTTP 路由或专用 Agent 配置作为事实来源。每项能力以稳定 `capabilityKey + version` 登记所属领域、`read / propose / execute` 类型、风险与确认策略、所需业务权限、允许目标类型、输入输出及错误 Schema、Action Gateway 策略和领域适配器；Mastra Tool 只是由该定义生成或校验的模型侧适配器，领域 API/Service 是执行侧适配器。

能力粒度对齐一个可独立授权、审计、校验并保证幂等的业务命令或查询，例如 `departure.read`、`source_order.list`、`source_order.create.propose`；不按数据库表生成 CRUD，也不机械复制 Controller 路由，更不把整个领域折叠为一个 `*.manage`。多步骤目标由 Agent 或有界 Workflow 组合多个能力，能力本身不隐藏跨领域长流程。

`read`、`propose` 与 `execute` 使用独立 capabilityKey、Schema 与授权规则，不通过模型可选的 `mode` 参数切换风险语义。高风险写操作只向模型暴露 propose；User 确认必须绑定具体提案、对象版本和内容哈希，由服务端直接提交同一提案，不能在确认后要求模型重新生成 execute 参数。只有风险策略明确允许的低风险即时操作才可把 execute 能力装配给模型，但仍须经过 Action Gateway 与领域事务。

Capability 与 Agent Definition 的可执行契约采用 code-first registry：key/version、Schema、风险类型、Gateway 策略、领域适配器、instructions、processor 组合及测试/eval 随代码发布。数据库只在已登记版本中保存 Organization 启停与灰度、模型/成本策略、允许范围内的风险/确认策略及推荐版本，不能动态创造不存在于代码中的能力。Attempt 在 Context Manifest 固定实际 Definition/Capability 版本和 Schema 摘要；新版本不热替换运行中 Attempt，旧版本停用后仍保留审计识别。

Organization 策略只能收窄能力、数据范围或增加确认，也可在代码登记的安全档位内选择阈值；不能越过平台硬性规则、User 业务权限、组织隔离、幂等、版本校验和强制审计，不能自行把高风险能力降级。平台保留全局紧急停用能力。最终授予始终是平台规则、实时业务权限、Organization 策略及当前任务/对象范围的交集。

Organization Module Entitlement 的完整目录、持久化和管理能力不阻塞第一阶段 Agent 平台底座及开发期业务竖切。第一阶段仍须通过统一 `CapabilityGrantResolver` 计算授予，并强制实时 User 权限、Organization 隔离、业务对象范围和风险策略；尚未实现的 Entitlement 维度必须被明确标记为未启用，不能以隐式全开伪装成已经支持。后续 #171–#174 通过同一 Resolver 接入，不改变 AgentDefinition、CapabilityDefinition、Worker 或 Action Gateway 状态机。在 Entitlement 接入前，平台不得宣称已经支持按 Organization 开通 Agent 模块，也不得据此进行生产范围推广。

所有 read、propose 与 execute 能力调用都进入 Action Gateway。Gateway 验证 capability key/version 确实属于本 Attempt 授予集合和当前 generation，依据数据库关系解析真实 Organization 与业务目标，复验权限和范围，建立稳定 Action 后才调用领域适配器并记录安全摘要、决策与结果。read 通常自动允许但仍受敏感字段策略约束，propose 不提交业务事实，execute 增加确认、幂等、版本与事务检查；任何 Tool 都不能自行选择绕过 Gateway。

每项能力分别声明 model-facing input、可信 Request Context 和 output Schema。模型只提供业务意图参数及必要的对象 locator；User/Organization、Conversation/Task/InputBatch/Attempt、generation、Context Manifest、delegation token 和 capability version 由服务端注入且不可被模型覆盖。可以从当前任务或页面唯一推导的目标不要求模型重复填写；模型提供的对象 ID 也只作为候选 locator，Gateway 必须按数据库关系解析并验证归属和授权范围。

能力结果使用统一判别信封表达 `succeeded / needs_confirmation / needs_user_input / conflict / denied / failed`，携带稳定 Action/Interaction/Proposal 标识和必要恢复提示；具体 `data` 由能力 output Schema 定义并按最小披露投影。Worker 和前端只依赖稳定状态与错误 code 驱动重试、HITL、冲突及 UI，不能解析自然语言错误文案；数据库异常、堆栈、内部表名和敏感授权细节只进入受控运行轨迹。

能力发现遵守最小披露。模型只看见本 Attempt 实际授予的 Tool 描述，不获得枚举全局 registry 或申请额外工具的能力。User 询问“能做什么”时，平台可以投影当前身份、Organization 与场景下可用的产品能力类别，但不暴露内部 capability key、Schema、安全策略或未授权敏感能力；产品帮助投影不能替代真实授予和 Gateway 复验。

Skills、MCP 与 Capability 分层：Skill 只提供版本化知识、操作说明和示例，不授予权限；MCP Tool 只提供外部技术连接，必须显式包装为 code-first CapabilityDefinition 后才能装配。涉及小团宝业务数据或副作用的 MCP 调用仍通过 Action Gateway；所有外部结果按不可信 Tool Result 做大小限制、敏感字段处理和 Prompt Injection 防护。安装 Skill、连接 MCP 或更新 Agent Definition 都不能自动扩大 User 的授予集合。

第一阶段不启用自由 specialist handoff 或 Agent Network，只保留结构化交接契约的演进空间。至少两个领域竖切稳定后，只有确定性路由/单 Agent 的跨领域质量问题已量化、handoff 输入输出有 Schema、接收方独立重算能力授予、trace/Token/延迟/eval 可观测、失败仍由 PostgreSQL Attempt/Action/HITL 恢复，并重新验证 Mastra Network 与 Observational Memory 兼容边界时，才另行决策启用；不能以“框架已经提供”为采用理由。

新 Capability 默认关闭，必须完成稳定 key/不可变版本、model input/trusted context/output/error Schema、服务端目标解析、权限和 Organization 范围、类型与风险、Gateway 策略、领域适配器、写入幂等/冲突/确认、结果脱敏和容量限制、契约/权限/跨组织/重复执行/恢复测试、代表性 eval 及 Token/延迟预算后才可灰度启用。破坏性变更新建版本；全局紧急停用在每次 Gateway 调用时实时复验，即使 Tool 已进入当前 Prompt 也拒绝后续调用。停用不删除历史 Definition、Action 或 Manifest 的审计识别。

版本化 Agent Definition 只引用声明的能力集合。每次 Attempt 由服务端根据当前 User、Organization、任务类型与阶段、页面/对象范围和有效权限解析实际授权子集，再通过类型化 Request Context 与动态 tools 装配给 Mastra；模型不得请求扩权，浏览器不得自报 capability，静态 Agent 也不得默认持有注册表中的全部工具。

实际授权集合采用确定性交集：Agent Definition 声明能力 ∩ 当前任务类型/阶段策略 ∩ User 实时权限 ∩ Organization 数据范围/功能开关 ∩ 页面/业务对象范围 ∩ 风险策略。结果及定义版本进入 Context Manifest；Mastra 只据此动态装配 tools。Action Gateway 在每次调用时仍按服务端解析的真实目标重新鉴权和审计，但不能用“注册全部工具后事后拒绝”替代最小工具集合。

产品只提供一个小团宝 Agent 会话入口，执行层使用版本化专长 Agent Definition。通用定义负责无任务问答与目标澄清，建团、客源、财务等领域以各自 instructions、模型策略、声明能力、processors、structured output 和 eval 配置运行；同一会话或任务的不同 Attempt 可以采用不同定义，但会话历史、任务、HITL 和业务事实始终留在控制面。第一阶段不向 User 暴露机器人选择，也不使用模型自由协商的 Agent Network。

Agent 路由按“确定性关联优先、模型辅助意图识别、服务端最终映射”执行。Interaction/Review Package/既有 Task 直接按关联类型和阶段路由；新自然语言目标可在同一 Attempt 的有界 Mastra Workflow 中生成结构化 intent、对象引用和置信度，但服务端只接受登记意图并映射到允许的 Agent Definition，再执行能力求交。低置信、多目标或对象不明时生成持久追问；模型不得直接返回可生效的 agentId 或 capability 列表。

第一阶段先建立版本化 Agent/能力注册表、服务端类型化 Request Context、工具 input/output/context Schema、统一 processor pipeline、structured output、调用 usage/trace 和离线 eval；随后用一个建团之外的只读或低风险竖切证明平台契约可复用。`TokenLimiterProcessor` 作为每个模型 step 的容量安全网；Observational Memory 只在解决 per-User/per-Organization resource 隔离后作为非权威技术会话压缩 PoC，并继续由 Context Builder 注入当前业务事实、由 Context Manifest 记录模型实际输入。

#352 不再作为一个未排期的整体被动引用，而须拆成可独立交付的加固切片并接入本平台依赖图：证据契约与 Worker 原子审核提交是通用 Review Package 的前置，Gateway 权威目标解析是新增 Capability 的前置，当前消息去重与统一动态预算是通用会话运行前置，Mastra TokenLimiter 与实际 usage 是第一阶段退出条件，确定性压缩、版本化摘要和原文 locator 回读是长会话连续性验收前置，超长输入持久化、稳定分块与结构化合并是超长输入能力验收前置。任何子能力在对应切片完成前不得由 #363 或其子票宣称已经交付。

Mastra 分阶段采用的第一阶段固定为“可治理执行底座”：以版本化 AgentDefinition 与统一 Agent Factory 取代领域内散落的静态 Agent 实例；Factory 只通过类型化 RequestContext 接收服务端可信身份、组织、Attempt、Manifest 与授权集合，并从 CapabilityDefinition 装配本 Attempt 实际授予的 Tools。每个 Tool 具备 input/output/context Schema，所有模型调用经过统一 input/output processor pipeline，意图、追问和交互结果使用 Structured Output，并至少记录逐 step 的模型、Token、耗时和 Tool 调用用量。

第一阶段的退出条件是现有建团 Agent 已通过统一 Factory 运行、模型不可见未授权 Tool、模型输入不能覆盖可信 RequestContext、Schema 违规以稳定错误失败且 step 用量可关联到 Attempt。此阶段不启用 Observational Memory、Agent Network、自由 specialist handoff 或大范围 MCP/Skills，也不让 Mastra Workflow 接管跨日任务、持久审核和业务恢复；这些能力必须通过后续阶段的独立准入决策。

第二阶段在任何第二业务竖切之前建立 tracing 与 eval 发布门槛。Mastra Trace 必须以稳定 ID 关联 PostgreSQL InputBatch、Attempt、Action 和实际 Agent/Capability 版本，记录模型、逐 step Token/耗时、Tool 选择、结构化结果状态与稳定错误码；Prompt 和 Tool Result 默认只留脱敏摘要、Hash 与必要 locator，不永久保存完整原文。Trace 用于技术诊断，不成为业务事实或恢复源。

运行关联链固定为 `Conversation → InputBatch → ContextManifest → Attempt/generation → Mastra traceId/stepId → Action → Interaction/Review Package/Domain Command`。其中 PostgreSQL 保存 User 命令与冻结批次、实际 Manifest、Attempt/generation、实际授予版本、Action 决策/幂等/确认/结果、业务对象版本和最终 Outcome，是审计与恢复的权威来源；Mastra Trace 只保存模型调用、Processor、Tool 选择、Structured Output、Token、耗时及技术错误等执行细节。Trace 丢失不得阻断恢复，Trace 成功也不能证明授权合法或业务提交成功；两层禁止依靠时间戳或自然语言拼接归属。

观测数据采用分层留存：Mastra 结构化 step/tool trace 默认 30 天，失败、拒绝和超时的详细 trace 默认 90 天，Token、延迟、成功率及错误码聚合默认 13 个月；完整 Prompt、Tool Result 和模型隐藏思维过程默认不保存。确需诊断原文时必须显式限定 Organization 与 Agent 版本、执行脱敏和加密、记录访问审计并在最长 7 天后自动删除。Trace TTL 不作用于被业务审计引用的证据与权威记录；这些内容由 PostgreSQL/对象存储按自身留存规则保存，不能通过“固定 trace”规避数据分类。

第二竖切前的运行指标分为六组并按 Agent Definition、Capability 版本和业务场景切分：① PostgreSQL Attempt outcome 与端到端耗时；② Action allow/deny/conflict/failed/succeeded/replay 和审计完整性；③ Tool 选择、Schema 拒绝、Gateway 拒绝、技术失败、业务成功及 P50/P95；④预算 Token 与 Provider 实际 usage、窗口占用、压缩/locator 回读/分块及 Manifest/实际 Prompt 摘要一致性；⑤租约过期、generation 拒绝、Worker 重领、重试/replay、恢复耗时和崩溃点测试；⑥首次响应、完整回复、进入追问/审核及确认后结果可见时间。

写操作审计缺口、未授权调用实际执行、重复请求产生重复业务效果、Manifest 与实际 Prompt 摘要失配、容量治理静默丢弃权威内容均为零容忍门槛。Tool 技术调用成功不计作业务成功，Gateway 正常拒绝不混入依赖故障；所有比率必须有明确分母并至少报告样本量，延迟报告分位数而非只报告平均值。模型质量、Token 和延迟先按场景建立基线再制定门槛，不能使用任意全局百分比。

Eval 裁判分为四层：①服务端代码、数据库与领域服务硬校验权限、Organization 隔离、Schema、证据绑定、对象版本、确认 Hash、幂等、金额与领域不变量；②固定输入/业务快照/期望 Action 的确定性场景回放，校验 Tool、参数、Structured Output、状态转移和业务结果并作为发布硬门槛；③业务人员按版本化 Rubric 标注高价值、歧义与历史失败样本，形成 Golden Dataset；④固定 Judge 模型和 Prompt 版本、经人工样本校准的 LLM-as-a-Judge，只评价语言质量、解释清晰度和任务拆解等语义维度。

LLM Judge 不得裁定权限合法、证据真实、财务正确或业务提交成功，也不得单独放行或阻断高风险版本。发布报告必须分别展示四层结果、样本量和版本，不能把模型总分表述为业务正确率；任何模型评分与服务端硬断言冲突时，以硬断言失败为准。

Eval 数据采用版本化场景矩阵，每个案例固定场景 ID/目的、User 角色与 Organization 权限、业务快照和对象版本、输入消息与会话来源、允许的 Agent/Capability 版本、期望 Tool/Action/状态转移/领域断言、Token/延迟/追问预算和人工 Rubric。数据集分为可调试开发集、每次版本必跑的回归集、限制访问的 Holdout 集和覆盖权限/跨组织/证据伪造/Prompt Injection 的零容忍安全集。

来源包括人工标准场景、建团正常/歧义/异常路径，以及经过脱敏和最小化的已修复生产失败；不得直接复制完整生产 Prompt、附件或业务数据。并发、权限撤销、重复执行、超长输入和恢复故障必须以可重放夹具覆盖。新增能力、线上故障修复或风险策略变更必须增加对应案例；案例与期望版本不可覆盖，历史运行结果保留版本关联。

版本发布采用三类门槛：安全集、未授权执行、跨 Organization 泄漏、写审计缺口、重复业务效果、Schema/证据/版本/领域不变量和 Manifest/实际 Prompt 摘要一致性属于硬断言，任一失败即阻断；Tool 选择、字段正确率、追问合理性和人工质量使用同一回归集相对当前生产基线评估，报告样本量、变化和失败案例，LLM Judge 不独立决策；Token、P95 延迟、失败率和最大 step 数按 Agent/Capability 场景设预算，超限默认阻断并要求显式审批预算变更。

发布先通过离线 Eval，再按 Organization 小范围灰度并比较基线指标与错误分布；达到停止阈值立即关闭新版本，旧 Attempt 继续使用 Manifest 固定版本而不热切换，观察期通过后才提升推荐版本。不得使用覆盖所有业务的单一 Token/延迟阈值，也不得以总体平均值掩盖长尾或特定场景退化。

进入第二竖切前必须通过固定故障注入矩阵：Worker 在认领后/模型中/Tool 前后退出、Action 已执行但 Outcome 未持久化、租约过期的旧 generation 迟到、模型超时/限流/非法 Structured Output、Tool/领域 API 暂时故障、执行中权限撤销、对象版本变化、Review Package 等待期间刷新/断线/换设备、SSE 重连，以及上下文压缩或分块失败。每例验证最终 Attempt 状态、Action 数量、业务记录数量和 User 可见结果，而非只验证 Worker 重启。

恢复必须保证 User 命令和已持久状态不丢、旧 generation 不推进、已提交 Action 不形成第二份业务效果、持久 HITL 可由 PostgreSQL 重建。自动重试具有次数和退避上限；无法恢复时持久化明确 `failed` 并在会话告知 User，不增加专用运维重试界面或公开重试 API。User 后续重新表达目标时，从最新业务事实创建新 InputBatch/Attempt，而不是复活旧运行时状态。

现有建团场景先形成代表性离线 Eval 数据集，至少度量工具选择正确率、Structured Output Schema 通过率、未授权工具调用、证据引用有效率、候选字段正确率，以及 Token、延迟和失败率预算。Agent Definition、Prompt 或 Processor 版本升级前必须运行对应基线；只有异常可定位到 Attempt/step/Action 且基线稳定通过，才允许进入第二竖切。Eval 结果是发布证据，不替代服务端权限、Schema、证据校验和领域不变量。

第三阶段以“合作伙伴往来账款查询”执行第二竖切，目标是验证平台复用而不是扩大功能数量。User 可以按合作伙伴名称或当前合作伙伴页面 locator，查询指定出团日期范围内的应收、应付、已核销、未结清概况及相关账款和发团；不提供日期时按全部有效账款回答并明确口径。服务端以当前 Organization 和 `/partner` 读取权限解析真实 Partner；名称搜索无结果或存在多个候选时形成持久追问，由 User 选择，模型不得猜测对象。

该场景保持无 Task、跨领域、实时只读，只能通过增加 AgentDefinition、CapabilityDefinition 和领域适配器接入，并复用既有 Conversation、InputBatch、Attempt、Action、Gateway、Trace 与 Eval；不得复制 `ai-create-*` 基础设施、为查询创建空 Task/Review Package，或新建第二套会话和恢复链。查询必须调用现有 Partner 与 PaymentSchedule 领域 API/Service 读取最新事实，复用其 Organization、`/partner` 权限和字段披露口径，不直接查询 Prisma 拼装旁路结果。只有不修改平台核心状态机即可接入、独立 Eval 达标且能明确分离平台与领域职责，才视为通过；供应商应付、发团财务概况和任何写操作不进入本竖切。

该竖切只证明 taskless 读取能力、授权、Action 审计、Trace/Eval、结构化结果和业务深链可以跨领域复用，不证明第二个领域的写 Capability 已经成立。当前交付的通用写入契约只由建团场景验证；未来接入第二个写领域时，仍须重新验证该领域的 Proposal/Review 适配器、对象版本/CAS、稳定 Action 身份、幂等和事务边界，但不因此修改平台状态机。未完成该验证前，产品和发布报告不得宣称“跨领域通用写入已经验证”。

能力拆为三个独立的只读 Capability。`partner.search.read` 只接收名称关键词并返回对象消歧所需的 partnerId、名称、类型和状态等最小候选，不披露联系人电话或结算备注；`partner.ledger.summary.read` 接收服务端已解析的 Partner locator 和可选出团日期范围，返回按 direction 与 sourceType 分组的笔数、约定、已核销和未结清金额；`partner.ledger.items.read` 再按方向、日期范围和分页参数返回白名单化的账款编号、关联发团、标题、到期日、金额和状态。

三个能力全部经过 Action Gateway 并记录只读 Action。当前页面 locator 与模型提供的 partnerId 都只是候选，Gateway 仍须按数据库关系核验 Organization 与 `/partner` 权限。默认先调用 summary；只有 User 请求明细时才调用 items，并由服务端按固定业务排序返回最多 3–5 条预览。不得把现有 Controller 全响应原样暴露给模型，也不得用一个大工具隐藏搜索、汇总和明细的授权、容量及 Eval 边界。

查询完成后以有界结构化 Conversation Event 保存结果快照，至少固定 queriedAt、Partner locator、日期筛选与统计口径、汇总、已展示的明细页、来源 Action 以及必要的业务版本或摘要。历史会话始终展示当时查询结果并标明时间，不在渲染时静默替换为最新数据；User 点击刷新或继续询问当前状态时，创建新的 InputBatch、Attempt 和只读 Action，再追加一份新结果。点击账款或 Departure 链接进入业务页面时，由业务页面读取当前事实。

读取历史会话仍须复验当前 User 的 `/partner` 权限；权限已撤销时，服务端投影隐藏受限的账款结构化内容，而不是以“过去看过”为由永久放行。精确金额和明细主要保存在带 Capability/敏感分类、可单独授权投影的结构化卡片中，Agent 普通文本只作不重复敏感数值的概括，避免权限变化后无法从自然语言事件中安全移除。权威事件保持不可变，权限投影隐藏不删除原审计记录。

账款范围由领域服务根据稳定参数计算，模型不得自由解释。`balanceScope=all_active` 表示未关闭、未作废的全部有效节点，包含已结清节点，并汇总约定、已核销和未结清金额；`balanceScope=open_only` 进一步只保留未结清金额大于零的节点。`receivableWindow=overdue` 沿用现有应收口径：到期日早于当前业务日期、未关闭、未作废且仍有未结清余额；应付只支持开放未付，不定义或展示“逾期应付”。

`departureDateFrom / departureDateTo` 始终筛选关联 Departure 的出团日期，不代表账款创建日或到期日。User 只说“今年”或“本月”时按出团日期解释并在结果卡明确标注；User 明确要求当前能力未支持的到期日期范围时，Agent 说明限制并请求调整，不能静默替换成出团日期。稳定枚举由 Tool Schema 约束，最终过滤与金额计算仍由 PaymentSchedule 领域服务完成。

会话结果采用紧凑的 `partner-ledger-query-result@v1` Activity，而不是传统分页列表。默认只呈现文字概括、查询对象/时间/口径及应收应付汇总；User 明确要求明细时，复用正式 PaymentSchedule 列表口径，按 `updatedAt desc` 和稳定 ID 消歧返回最近更新的前 5 条白名单预览，并显示排序说明及“共 N 条，仅展示 5 条”。模型不得自行挑选所谓重点记录，也不得为总结拉取全量。卡片不提供 page size、页码、跳页或自动连续读取，也不得用 HITL/Interrupt 把“下一页”伪装成人工决策。

需要浏览、筛选、排序、分页或逐条核对时，卡片提供“打开往来账款”等显式入口进入正式 Ant Design 业务页面，由该页面读取最新业务事实并承载完整交互。User 在会话中继续要求“只看应收”或“列出相关发团”视为新的自然语言查询，创建新 InputBatch 与只读 Action并追加结果，不改变旧卡。当前 controlled CopilotChatView 继续把服务端持久化结果事件投影为 ReactActivityMessageRenderer；未来 AG-UI Tool Call 真正接通后，可将同一结果组件复用到 useRenderTool，但呈现方式不改变权限和事实边界。

合作伙伴账款卡使用“查看应收明细”“查看应付明细”等明确动作，不让模型猜默认方向。目标 URL 只携带服务端生成并由前端白名单映射的 partnerId、`tab=accounts`、direction、出团日期范围及 `open_only / overdue` 等稳定筛选，不携带金额、自然语言结果、权限声明或任意 URL；业务路由打开后重新读取最新数据并鉴权。当前 PartnerDetailPage 的 Tabs、方向和日期范围仅为组件本地状态，正式实现须补可校验 Search Schema 和 URL 驱动状态。

在业务页侧边栏模式点击按钮时，只切换底层业务路由并保持面板与当前 Conversation；在全局 Agent 模式点击时，退出全局模式、进入目标业务页并在侧边栏恢复同一 Conversation。该显式动作与历史会话切换严格区分：选择、新建或回看 Conversation 本身不自动改变业务页面。

第二竖切只有同时满足以下条件才视为平台复用通过：

1. 代码只增加 Partner 领域的 AgentDefinition、三个 CapabilityDefinition、领域适配器和结果 renderer，不复制 `ai-create-*` 基础设施，也不为 Partner 修改通用平台状态机。
2. 查询产生 Conversation、InputBatch、ContextManifest、Attempt 和全部只读 Action，但不创建 AgentTask、DepartureCreationTask 或 Review Package。
3. 汇总、过滤和预览与 Partner/PaymentSchedule 领域服务一致；伪造 Partner ID、跨 Organization、缺少 `/partner` 权限及不可信页面 locator 均由 Gateway 拒绝。
4. 唯一名称正常执行，无结果或多候选形成刷新后可恢复的持久 Interaction，模型不自行消歧。
5. `all_active / open_only / overdue`、开放未付与出团日期范围均有确定性场景；不生成逾期应付，预览固定为正式列表最近更新前 5 条。
6. 查询 Activity 可跨刷新、历史和设备恢复，权限撤销后不再投影敏感结构化内容；会话内无分页，业务跳转在侧边栏与全局模式下均保持同一 Conversation。
7. Search Schema 可刷新和分享但不携带敏感结果，目标页面重新鉴权并读取最新业务事实。
8. 搜索、汇总和预览均可由 InputBatch、Attempt、Action 关联到实际 Definition/Capability 版本；Eval 覆盖正常、歧义、伪造、跨组织、权限撤销、超长结果和业务变化，并建立 Tool 选择、Token 与延迟基线。

任何能力若只能通过在通用表或状态机加入 Partner 专用字段才能落地，则本竖切判定失败，应先修正领域适配边界，不能把特例提升为平台概念。

第四阶段才允许 Observational Memory 进入受控 PoC，前提是两个竖切均稳定，固定 AG-UI resourceId 已替换为服务端生成的 per-User/per-Organization 隔离标识，确定性 Context Builder/版本化摘要、locator 回读、超长输入分块、逐 step TokenLimiter 和可区分输入来源的 Trace 均已投入使用。OM 只压缩当前会话较旧的非权威消息与可重新读取的冗长 Tool 过程结果，不得改写当前 InputBatch、Task、最新业务事实、Review Package、证据、确认结果、Context Manifest 或 PostgreSQL 记录。

PoC 必须通过 A/B Eval 比较 Token 节省、事实召回、Tool 选择、延迟与跨租户隔离；质量不下降且成本收益明确后才可灰度，否则继续使用确定性压缩。当前 Mastra 版本下 Observational Memory 与 Agent Network 不假定兼容，第四阶段不得同时启用 Network，未来组合前必须重新核实版本与隔离边界。

Mastra Workflow 不作为独立的平台阶段全面启用，而是在执行底座和 Trace 可用后按场景准入。只有一个 Attempt 内确实存在多个有意义且边界清楚的步骤，例如独立来源并行读取、超长输入分块抽取与结构化合并、抽取后的规则校验/修复/评估，并且每步输入输出有 Schema、可追踪和可取消时，才采用 Workflow；简单 Tool 调用不为使用框架而额外包装。

Workflow 内的副作用继续经过 Action Gateway、幂等和领域事务。遇到需要 User 输入或确认时，Workflow 只产出结构化 `needs_user_input` 或 `needs_confirmation`，由 PostgreSQL 持久化 Interaction/Review Package 后结束当前 Attempt；User 响应创建新 InputBatch 与 Attempt，并从权威状态重建，不依赖 Mastra suspend 内存承担跨日 HITL、业务恢复或权限控制。

至少两个领域竖切稳定且 Trace/Eval 证明单 Agent 在跨领域目标中出现可量化的 Tool 选择、Prompt 容量或质量问题后，才进入专长交接阶段。第一步只实现服务端确定性 Handoff：当前 Agent 输出 Schema 化领域意图和必要对象 locator，服务端验证并选择已登记 AgentDefinition，为新 Attempt 重新计算权限、Organization 范围和实际 Tools；后续只通过 PostgreSQL Conversation、Task、Interaction 与最新业务事实衔接，不共享 Specialist 运行时内存或继承上游授权。

自由 Agent Network 不随第二个 Specialist 自动启用。只有确定性 Handoff 仍有 Eval 可证明的不足，并且目标 Mastra 版本下 Network 的权限重算、成本/延迟、失败恢复、Trace 可读性及与 Observational Memory 的兼容性全部通过专项评测，才允许独立灰度；失败仍投影为当前会话中的稳定错误或持久追问，Network 不成为新的控制面。

MCP 与 Skills 不设置“全量启用阶段”，只在第二竖切验证后按明确业务需求逐项准入。外部 MCP Tool 必须具备稳定 Schema、超时/容量/敏感字段和失败降级策略，并显式包装为 CapabilityDefinition 后才进入本 Attempt 的授权装配；涉及小团宝数据或副作用时继续经过 Action Gateway、幂等与领域校验，不能绕过现有领域 API。Skill 只承载可版本化、可渐进加载并与 Agent Definition、适用能力和 Eval 用例关联的知识与操作说明，不能保存业务事实、User 长期记忆或授予权限。只有普通 Capability/Prompt 无法合理满足明确需求，且安全、成本与 Eval 证据齐备时才接入。

Mastra Workflow 只用于一次 attempt 内边界清楚的技术编排，例如多来源读取、抽取、合并和评估；跨日任务、人工审核、失败恢复和业务提交继续由 PostgreSQL Workflow Worker 掌握。专长 Agent 的选择先由服务端按任务类型和权限确定性路由，只有多个领域协作出现可验证收益后才引入 specialist handoff 或 Agent Network；当前 Mastra 版本下 Agent Network 与 Observational Memory 也不能假定可组合。MCP 与 skills 只作为受控外部能力和渐进知识装载，不能赋权、充当业务事实或绕过 Action Gateway。

## Consequences

- 新增 Agent 业务优先扩展通用会话、任务、会话关联、能力注册、运行和观测契约，再实现领域适配器；不得复制 `ai-create-*` 基础设施形成第二套平台，也不得把任务重新收缩为单一会话的附属对象。
- 会话输入、执行尝试与 Agent 动作共用同一套持久运行和治理链，任务关联按是否存在长期目标决定；无任务查询与即时操作不能因此退化为浏览器临时执行或绕过审计。
- 现有 AI 建团功能直接迁入通用平台并作为第一个领域适配器，不保留开发期 Agent 历史数据、双写或长期兼容链；新的平台 API、导航和领域文档不再把“新建 AI 建团任务”当顶层入口。
- “充分使用 Mastra”以是否减少自建运行时、提高装配一致性和可观测性为标准，不以启用全部框架特性为目标；任何框架能力一旦与权限、事务、审计或可靠恢复冲突，业务控制面优先。
- 研究与版本边界见 [`docs/research/2026-mastra-agent-platform-capabilities.zh-CN.md`](../research/2026-mastra-agent-platform-capabilities.zh-CN.md)；上下文压缩专项见 [`docs/research/2026-mastra-context-engineering.zh-CN.md`](../research/2026-mastra-context-engineering.zh-CN.md)。
