# Agent 历史会话存档与当前模型上下文研究

> 研究日期：2026-08-14
>
> 源码快照：OpenAI Codex [`3711943`](https://github.com/openai/codex/tree/3711943d11a1c69a65afe98757814b6b5244fbaf)，OpenCode 已落地代码 [`d8bf792`](https://github.com/anomalyco/opencode/tree/d8bf79225f28775064ca319543196f13dbebc44b) 与 V2 设计 [`0e34745`](https://github.com/anomalyco/opencode/tree/0e3474509aa5ad16afcf9c439785514d6443c6af)。GitHub 上旧地址 [`sst/opencode`](https://github.com/sst/opencode) 当前重定向到官方仓库 `anomalyco/opencode`。
> 范围：只核对两项目的官方仓库、官方文档与源码。本文区分源码事实和针对小团宝的架构推论。

## 结论

Codex CLI 和 OpenCode 都没有把“用户能看见完整历史”直接等同于“下一轮把完整历史重新塞给模型”。它们共同采用了三层思路：

1. **持久化层**保留会话、消息、工具调用等记录，以支持浏览、恢复或分叉；
2. **上下文投影层**在发起模型请求时，只组装仍然有效的压缩摘要、近期消息和经过裁剪的工具/媒体内容；
3. **会话边界层**明确区分新建、继续原会话和从旧会话分叉。

因此，小团宝当前“新打开的会话不再自动继承上次关闭前的聊天与文件解析全文”是合理的阶段性止损，但不能把它实现为删除历史。长期方案应是：**完整记录可存档浏览；只有显式继续同一会话时，系统才根据预算生成当前上下文；新会话默认空白，不继承旧附件和解析内容。**

## 对已确认架构方向的评估

小团宝已确认的方向是：完整事件历史归档；每轮由 `Context Builder` 使用当前输入批次、当前系统事实、显式引用的档案解析版本和滚动摘要构造模型输入；不全量回灌历史；用 `Context Manifest` 留下本轮实际输入的证据。研究结论是：**方向成立，而且比直接照搬 Codex/OpenCode 更适合业务系统。**

| 已确认方向 | 评估 | 来自官方实现或设计的依据 |
|---|---|---|
| 完整历史与当前模型输入分离 | 应坚持 | Codex [可在恢复时排除 turns 并另行分页读取](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/app-server/README.md#L359-L367)；OpenCode V2 明确[完整 transcript 持久化，但活跃模型表示替换为滚动摘要与有限近期上下文](https://github.com/anomalyco/opencode/blob/0e3474509aa5ad16afcf9c439785514d6443c6af/specs/v2/session.md#L111-L121) |
| 当前输入先持久化，再进入模型历史 | 应坚持 | OpenCode V2 把 durable inbox 与 model-visible history 分开；输入只有经过原子 promotion 才进入模型历史，[官方 Session 设计](https://github.com/anomalyco/opencode/blob/0e3474509aa5ad16afcf9c439785514d6443c6af/specs/v2/session.md#L35-L37) |
| 当前系统事实独立装配 | 应坚持，且优先级高于摘要 | OpenCode V2 把环境事实、指令和技能等建模为独立 Context Sources，在安全的模型调用边界形成可持久化 Context Snapshot，[官方 Context Epoch 设计](https://github.com/anomalyco/opencode/blob/0e3474509aa5ad16afcf9c439785514d6443c6af/specs/v2/session.md#L54-L99) |
| 档案必须显式引用并固定解析版本 | 应坚持，这是小团宝需要额外强化的业务约束 | 两项目都会裁剪旧工具结果与媒体，证明“历史出现过”不等于“以后一直注入”；但它们没有替小团宝解决业务资料版本追溯，必须由 `materialId + parseResultVersion` 明确表达 |
| 滚动摘要只承接交流背景 | 应坚持，不能把摘要当业务事实 | 两项目的 compaction 都是有损投影。OpenCode V2 明确以 structured rolling summary 和有限近期上下文替换活跃模型表示，[官方 Automatic Compaction 设计](https://github.com/anomalyco/opencode/blob/0e3474509aa5ad16afcf9c439785514d6443c6af/specs/v2/session.md#L111-L121) |
| 每轮保存 Context Manifest | 建议落地，但不要误称为照搬现有项目 | 在本次核对的官方接口与源码中，没有发现与业务级 `Context Manifest` 完全等价的公开对象；最接近的是 Codex 的 rollout/compaction 检查点和 OpenCode 的 Context Snapshot。小团宝需要把它做成自己的审计对象 |

### 推荐的 Context Builder 边界

`Context Builder` 不是“把聊天历史拼成 prompt”的工具，而是从多种事实源生成一次**可预算、可追溯、可复现**的模型输入投影：

1. 以冻结后的 `inputBatchId` 和原子认领时的 `conversationVersion = N` 为边界，只读取序号不大于 `N` 的有效会话事件；
2. 加载本批用户消息和附件依赖，不自动带入其他历史附件；
3. 从业务数据库读取当前表单、权限和未解决审核状态。系统事实应覆盖摘要中的旧描述；
4. 只读取本批显式固定的 `materialId + parseResultVersion`，先使用结构化事实索引，再按需要选取原文片段；
5. 加载当时有效的滚动摘要及必要近期尾部，但把摘要标记为交流背景，而不是字段写入证据；
6. 应用单项和总 token/媒体预算，生成本轮 prompt；
7. 在 Agent attempt 执行前持久化 `Context Manifest`，使重试使用同一输入投影或明确产生新的 manifest 版本。

推荐的 `Context Manifest` 至少记录：

- `conversationId`、`inputBatchId`、`conversationVersion`；
- 使用的消息 event id/sequence；
- `summaryId + summaryVersion`；
- `materialId + parseResultVersion`，以及实际读取的事实索引项或片段 id；
- 当前表单/审核状态的快照版本或一致性标识；
- system prompt、工具 schema、模型和 Context Builder 的版本；
- 各来源 token 估算、裁剪原因与最终输入摘要哈希。

Manifest 不应复制隐藏推理，也不必再存一份完整档案正文。它记录的是“引用了什么版本、选了哪些片段、按什么规则组装”，原始内容继续留在各自权威存储中。

### 不能直接照搬的地方

- Codex 和 OpenCode 面向代码工作区，文件可以再次从工作区读取；小团宝的 OCR/Word 结果属于版本化业务资料，引用稳定性和审核证据要求更高。
- OpenCode V2 的 Context Epoch、durable inbox 和 compaction 设计与本方向高度一致，但官方设计仍把“进程崩溃后的可靠继续”列为后续工作，[Session 设计中的未完成项](https://github.com/anomalyco/opencode/blob/0e3474509aa5ad16afcf9c439785514d6443c6af/specs/v2/session.md#L101-L108)；不能据此替代小团宝已经确认的持久化 Worker、租约和幂等执行设计。
- 两项目的摘要主要服务于 Agent 连贯工作，不承担表单业务事实责任；小团宝必须保持“摘要可丢失细节，业务候选必须有原消息、系统事实或档案解析版本证据”的边界。

## Codex CLI 的处理方式

### 1. 新会话、恢复和分叉是三个不同动作

Codex app-server 明确规定：`thread/start` 创建新会话，`thread/resume` 继续原会话并向其追加新 turn，`thread/fork` 复制已存历史但生成新的 thread id；fork 还可以指定 turn 边界，只复制到某一 turn。[官方 app-server 文档：线程生命周期](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/app-server/README.md#L164-L167)

历史展示也不要求在恢复接口里一次返回全部内容：`thread/resume` 可用 `excludeTurns: true` 只返回元数据，再通过分页接口读取 turn 历史。这表明“恢复执行上下文”和“加载历史 UI”是可拆开的两个操作。[官方 app-server 文档：恢复与历史分页](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/app-server/README.md#L359-L367)

### 2. 恢复并非永远重放全部原始事件

Codex 会把 compaction 的 `replacement_history` 持久化为检查点。恢复时从最新仍有效的 replacement history 开始，只顺序重放检查点之后的存活尾部；一旦已获得检查点和恢复元数据，更老的 rollout 项不再参与重建当前历史。[恢复源码：查找最新压缩基线](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/session/rollout_reconstruction.rs#L113-L187) [恢复源码：基线加尾部重放](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/session/rollout_reconstruction.rs#L289-L378)

换言之，rollout 可以继续作为存档事实来源，但模型侧恢复的是“压缩后的有效历史”，而不是机械重放所有旧消息、工具结果和附件。

### 3. 压缩会丢弃细节，只保留可继续工作的投影

Codex 压缩后会用摘要替换历史，并在固定 token 预算内保留较新的用户消息；源码当前预算为 20,000 token。旧 assistant 细节、推理和工具结果不会作为原样历史继续存在于 replacement history 中。[压缩源码：构建替换历史](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/compact.rs#L347-L384) [压缩源码：近期用户消息与摘要](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/compact.rs#L639-L716)

Codex 自己也提示，长线程和多次压缩会降低准确性，应尽量开启小而聚焦的新线程。[压缩源码：长线程警告](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/compact.rs#L374-L390)

### 4. 工具结果和媒体有独立的上下文控制

工具输出在写入模型历史时会先按策略截断；在真正构造 prompt 时，还会补齐工具调用/结果配对，并按模型能力移除不支持的图片和音频。[历史处理源码：工具输出截断](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/context_manager/history.rs#L440-L501) [模型输入源码：媒体能力过滤](https://github.com/openai/codex/blob/3711943d11a1c69a65afe98757814b6b5244fbaf/codex-rs/core/src/context_manager/normalize.rs#L315-L407)

这说明附件与工具结果不应因为“曾经出现在会话中”就永久占用后续模型上下文。

## OpenCode 的处理方式

### 1. 完整消息可持久化，模型只消费压缩后的视图

OpenCode 每轮先通过 `filterCompactedEffect` 取得模型使用的消息。过滤逻辑遇到已完成的 compaction 后，只返回 compaction 指令、摘要、被保留的近期尾部及后续消息，而不是整个 session 的所有历史。[模型上下文过滤源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/message-v2.ts#L521-L580) [请求循环使用过滤结果](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/prompt.ts#L1081-L1096)

压缩时，OpenCode 会按 token 预算选择近期 turn 作为原文尾部，较老的 head 交给 compaction agent 总结；后续模型获得的是摘要加近期尾部。[压缩选择源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/compaction.ts#L223-L269) [摘要生成源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/compaction.ts#L319-L448)

### 2. 旧工具结果会被清空，但调用事实仍可保留

OpenCode 从后向前计算旧工具输出的 token 成本，超过保护预算后给旧结果标记 `compacted`。组装模型消息时，这些结果会变成 `[Old tool result content cleared]`，附件也不会再传给模型。[工具输出裁剪源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/compaction.ts#L271-L317) [模型消息映射源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/message-v2.ts#L290-L323)

### 3. 大媒体导致溢出时，不会重新注入原始媒体

OpenCode 为 compaction 构造模型输入时支持 `stripMedia`；用户附件会退化为文件名/MIME 占位文本。若因媒体超限需要重放用户请求，媒体部分同样被替换为 `[Attached ...]`，不会再次携带原始文件内容。[媒体占位源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/message-v2.ts#L198-L225) [溢出后重放源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/compaction.ts#L468-L495)

### 4. Fork 是显式复制，不是所有新会话的隐式默认行为

OpenCode 的 fork 会创建新 session id，并只复制指定 message 之前的消息和 parts；消息及 part 都重新分配 id。这是用户明确选择的分支操作，不是打开一个新会话时自动继承上次 session。[Fork 源码](https://github.com/anomalyco/opencode/blob/d8bf79225f28775064ca319543196f13dbebc44b/packages/opencode/src/session/session.ts#L693-L734)

## 对小团宝的约束建议

以下是结合上述事实作出的架构推论。

### 必须明确的三类对象

| 对象 | 用途 | 是否直接进入模型 |
|---|---|---|
| 会话存档 | 完整消息、附件引用、解析运行、工具调用、审核结果，供用户回看和审计 | 否 |
| 业务资料与解析结果 | 原文件、版本化解析结果、证据、已确认字段，独立于聊天保存 | 仅按当前任务选择性读取 |
| 当前模型上下文 | 当前用户输入、近期尾部、压缩摘要、必要业务状态和本轮选中的资料引用 | 是，受 token/媒体预算控制 |

### 会话边界

- **新建会话**：生成新 `conversationId`；默认不继承旧消息、旧附件、旧解析全文和未完成工具链。
- **继续会话**：仍使用原 `conversationId`；从最近有效摘要、近期尾部和当前业务状态重建上下文，而非全量重放。
- **从这里继续 / Fork**：生成新 `conversationId`，记录 `forkedFromConversationId` 和边界；复制的是受控上下文投影，不是把旧存档整体注入新 prompt。
- **查看历史**：单独分页加载存档 UI。打开历史会话不应自动启动 Agent，也不应立即解析附件或把全部历史送给模型；只有用户明确发送新指令后才组装当前上下文。

### 文件与解析结果

- 原文件和解析结果应作为独立、版本化的业务资源保存，通过 `materialId` / `parseRunId` 引用；聊天消息只保存引用和人类可读摘要。
- 旧会话里的文件解析全文默认只用于回看；若用户要在新会话复用，应显式选择“引用该资料”，再按当前问题检索或读取必要片段。
- 当前上下文只携带结构化候选、证据定位、简短摘要和所选片段；不能把整份 OCR/Word 解析文本在每轮自动回灌。
- 工具输出应有单项上限和总预算。关键业务结果写入领域状态；旧工具正文可在上下文中替换成“已执行 + 结果引用”，但存档仍保留可查记录。

## 对当前阶段性修复的判断

如果当前修复只是阻止“关闭后重新打开聊天时自动复用旧 CopilotKit 消息和旧文件解析内容”，方向正确；它建立了新会话边界并能立即解决长时间加载和无意义思考。

但后续实现历史会话时必须避免反向回归：**历史 UI 的数据源可以完整，模型 prompt 的数据源必须是单独生成、可预算、可解释的上下文投影。**最小后续技术工作应包括：

1. 独立的会话存档读取接口，支持分页且不触发 Agent；
2. 显式的“新建 / 继续 / 从这里继续”语义和不同 id；
3. 可版本化的 compaction summary 与 recent-tail 边界；
4. 资料引用、解析结果引用和上下文选片机制；
5. 可观测的上下文清单与 token 预算，能回答“这一轮为什么带入了这些历史”。
