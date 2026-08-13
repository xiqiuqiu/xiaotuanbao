---
status: accepted
---

# AI 候选确认落在表单上，不走聊天协同写入

AI 阶段审核包由 Agent 经 `submitReviewPackage` 持久化为待确认候选；User 在中间表单的待确认展示层查看、修正并以整包确认或拒绝，由 User 接口写入发团创建草稿。右侧会话只负责对话与「已建议修改哪些字段」的通知，确认不经过 Agent，也不使用聊天内 HITL 卡片作为写入入口。有待确认包时不再自动提交新包，除非 User 拒绝或明确要求重新整理。

**Considered Options**

- 在 CopilotKit `useHumanInTheLoop` 卡片上确认：`respond()` 会把结果送回 Agent，与「确认不是 Agent 工具」冲突。
- 右栏上审核、下聊天：把会话和被改的「文件」叠在同一块，刷新后卡片也不等于任务上的待确认包。
- 待确认值直接进表单并自动保存：未确认候选会进入业务快照。
