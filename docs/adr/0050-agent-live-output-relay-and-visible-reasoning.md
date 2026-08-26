---
status: accepted
---

# Agent 即时输出经 Worker 中继，思考过程可直播但不是会话事实

ADR-0046/0048 已规定：流式 Token 可以丢失，最终 Agent 消息与业务状态必须由 PostgreSQL 会话事件承担；浏览器与 CopilotKit 不得成为第二执行入口。统一会话壳落地后，生产路径改为 Worker 调用 `generate()` 再整段落库，User 在思考与生成期间只能等到最终消息，表现为长空白。

决定：

- 模型真流式只发生在 Agent 进程。Workflow Worker 消费 NDJSON，累积公开回复与思考过程，写入非审计的 **Agent 即时输出**，再用 PostgreSQL 通知唤醒 API；浏览器继续走现有会话 SSE，收累计 snapshot，不直连 Agent，也不经 `POST /copilotkit` / `runAgent()` 执行。
- 即时输出按 Attempt 与执行权代次隔离，不属于会话事件、Context Manifest 或审计记录。最终成功、失败、停止或被新尝试取代后删除；遗留行靠 TTL。重连可读当前份，丢帧不缺字，最终 `agent_message` 只替换回复正文。
- **Agent 思考过程** 对 User 直播，与回复正文分字段；只保留当前模型 step，下一 step 覆盖，不写入会话历史。工具参数、凭证与系统指令不得作为独立协议帧。思考不是业务承诺，也不能证明工具或领域命令已经提交。
- 尚无思考或回复 token 时，界面投影已有 `batch_status`（整理上下文 / AI 处理中），不留白。统一会话壳与即时输出同一交付提供 **Agent 本次运行停止**：停止后两段都删，不把半段字写成最终消息；收起面板或 SSE 断开不等于停止。
- Worker 有新文本后最多 80～120ms upsert 一次即时输出，累计约 128 字可提前刷；字数不是入场门槛。
- 现有 `HeadlessExecutionResult`、审核、追问、幂等发送和事件 sequence 语义不变。流式中继故障不得回滚已经提交的权威结果。

## Considered Options

- 浏览器直连 Agent 流：会把执行身份和 delegation token 交给前端，破坏 Worker 唯一生产入口。
- 只流回复、不流思考：当前模型先推理再说话，思考期间仍是白屏。
- 把思考附进最终 Agent 消息或另开会话事件：违反隐藏推理不得持久化的留存分层，体积也显著更大。
- 用 Redis Pub/Sub 做中继：当前部署没有 Redis；通知只唤醒、快照负责恢复，PostgreSQL 足够。

## Consequences

CopilotKit 仍是受控聊天壳：即时输出投影进 `CopilotChatView` 的进行中助手消息，传输层是会话 SSE 而不是 AG-UI 直播协议。第一版必须修正 `isRunning`（含 `ready_for_agent` / `preparing_context` / `agent_running` / `waiting_for_materials`），轮询只作断线补读。词表见 `CONTEXT.md` 中 Agent 即时输出、Agent 思考过程、Agent 会话事件、Agent 交互投影、Agent 本次运行停止。
