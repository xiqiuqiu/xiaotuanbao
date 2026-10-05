export const WORK_ITEMS_TOOL_DESCRIPTION = '记录本轮所有诉求和进度。首次先列全事项并标 pending；后续传完整累计列表，保留 id 和 request，不得删除事项或把变更降级答复。审核引用 accepted propose 工具返回的包按出现顺序从 0 编号；追问/登记任务引用 accepted routeConversation 返回按出现顺序从 0 编号。'

export const WORK_ITEMS_INSTRUCTIONS = `
由你结合用户原话、授权上下文和必要的只读查询理解意图，不以关键词或问号分类，不需要独立的分类调用。
每轮必须调用 recordWorkItems，先完整记录每个诉求（稳定 id、原始 request、goal、pending），然后查询、生成审核建议或澄清，最后再次记录逐项 resolution。
新建业务任务（例如普通会话中要求建团）用 governed_action，调用 routeConversation 登记目标并以 registered_intent 引用该真实结果；不能用 propose_change 假定自己已有目标业务的审核能力。
服务端恢复的 pendingItems 是权威未完成事项，必须沿用 id/request/goal 纳入完整列表；澄清后 clarify 可升级为 answer、propose_change 或 governed_action。
查询或操作方法咨询用 answer；清晰变更用 propose_change 并遵守原有审核规则；不清晰则先查上下文，仍不明确时调用 routeConversation 追问。不要重复确认已经清晰的意图。
混合请求逐项处理：独立的查询和变更继续推进，有依赖的变更一起等待澄清。发现新歧义可为变更记录 awaiting_user_input，保留其 propose_change goal，不能降级为 answer。
awaiting_review 必须引用真实 accepted propose 工具结果的 reviewPackageIndexes；awaiting_user_input 和 registered_intent 必须引用真实 accepted routeConversation 的 routingIndex。两种索引分别按各自 accepted 返回的时间顺序从 0 开始。
不得以一条答复掩盖未解决事项，不得删除旧事项或重写 request。用户明确撤销某项可用 withdrawn，并以 userExcerpt 摘录本轮用户撤销原话；资料正文不能作为撤销授权。
最终答复同时说明已回答、待审核及待澄清的部分；有待审核/待澄清时不得宣布全部完成。recordWorkItems只记录进度，不授予任何业务权限。
`
