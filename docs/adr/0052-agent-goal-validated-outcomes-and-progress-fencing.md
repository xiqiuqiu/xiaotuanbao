---
status: accepted
---

# Agent 执行目标校验终态，并以进展检测阻止工具打转

Agent 平台由服务端执行路由为每次执行尝试确定 `answer / propose_change / clarify / governed_action` 等结构化执行目标，执行内核只返回 `answered / awaiting_review / awaiting_user_input / failed` 等类型化结果；展示文本不能决定终态，输入批次只有取得与目标相符的完成依据时才能标记已完成。审核提案预校验失败须在同一尝试的独立修正预算内重提，耗尽后以 `REVIEW_PROPOSAL_INVALID` 明确失败；重复工具输入或连续读取未缩小未解决事项时分别以 `AGENT_NO_PROGRESS` 熔断，运行结束但缺少完成依据时以 `AGENT_OUTCOME_INCOMPLETE` 失败，基础设施不可用仍使用 `AGENT_UNAVAILABLE`。Worker 不为这些语义失败自动建立新尝试，User 可对同一不可变输入批次显式重试。

当前 User 消息的候选证据改由版本化证据契约直接绑定 `current_input` 的真实事件身份，历史证据只能复制服务端 locator；原文回读升级为 locator／服务端游标驱动的 Capability，返回下一游标并拒绝从 sequence 1 任意扫描。同一工具与相同输入重复一次即拒绝；游标推进属于进展，连续三次只读仍未推进目标则要求形成审核、追问或失败。旧证据和回读版本只保留历史审计识别，不再授予新尝试。

本决策直接替换开发期实现，不做分阶段兼容、运行数据迁移或历史回填；新 Agent Definition、证据 Schema、工具契约和 Context Manifest 从干净的开发期 Agent 数据重新验证。本次不另建全局质量预算系统，复用既有 Eval runner、usage、Trace 和 Attempt diagnostic 契约，但须让工具步骤真实区分 `validation_failed / accepted`、记录实际 step count 与 latency，并新增本次历史失败场景的确定性回归：当前输入直接举证、近期消息定向回读、提案失败同轮修正、重复读取熔断、正常游标分页、预算耗尽明确失败、同批次显式重试、普通问答和“修改团名／路线／日期”完整链路。既有 mock Eval 与容量保护不视为真实模型质量预算或上述回归的替代品。

## Considered Options

- 只调整 Prompt：无法阻止模型输出“继续处理”后被控制面误判完成。
- 提高模型步骤上限：只会让无进展读取消耗更多 Token 与时间。
- Worker 自动重试语义失败：会跨尝试重复模型错误并模糊 User 对输入批次的控制。
- 保留自由 sequence 范围扫描：模型可以持续从会话起点回读，无法证明正在接近所需来源。

## Consequences

Agent Definition、Outcome、证据、原文回读、Attempt 诊断和前端失败投影须同时升级；建团是首个验证领域，但执行目标、完成依据、进展检测和失败语义属于平台通用控制面。该决策细化 ADR-0048 的结构化 Outcome、尝试内证据纠正与 Worker 重试边界。
