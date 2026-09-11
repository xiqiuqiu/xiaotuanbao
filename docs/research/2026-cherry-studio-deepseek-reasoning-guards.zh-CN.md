# Cherry Studio 与成熟项目如何限制 DeepSeek「自言自语」

> 研究日期：2026-09-09  
> Cherry Studio 源码快照：[`aac4b350704c7bbfe045c9d6be10fd99de656a37`](https://github.com/CherryHQ/cherry-studio/tree/aac4b350704c7bbfe045c9d6be10fd99de656a37)（`main`，提交于 2026-09-09）  
> DeepSeek 官方文档：[`Thinking Mode`](https://api-docs.deepseek.com/guides/thinking_mode) / [中文](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)、[`Chat Completions`](https://api-docs.deepseek.com/api/create-chat-completion)  
> 范围：Cherry Studio 源码 + DeepSeek 官方协议 + Open WebUI / Vercel AI SDK 对照；再与小团宝现有 `public-reply` / `visible-reasoning` / `thinking: disabled` 逐项对照。  
> 本文区分「上游实现事实」和「对小团宝的判断」。

## 结论

Cherry Studio **没有**对 DeepSeek 的自言自语做「生成长度硬截断」或「无标签中文 chain-of-thought 启发式删除」。它做的是一套**通道工程**：

1. **请求侧关思考**：按供应商 wire 把 UI 的 off 写成 `thinking.type = disabled`（官方 DeepSeek）或 `extra_body.thinking.type = disabled`（CherryIN 等转发层）。
2. **响应侧分流**：原生 `reasoning_content` / `reasoning-delta` 走思考通道；Chat Completions 没有该字段时，用 AI SDK `extractReasoningMiddleware` 把 `<think>…</think>` 从 `text` 抽到 `reasoning-delta`。
3. **带 tools 的多轮必须回传**：给 `@ai-sdk/openai-compatible` 打补丁，assistant 消息**无条件**带 `reasoning_content`（空字符串也发），避免 DeepSeek / GLM / Kimi / MiniMax 的 400。
4. **上下文默认保留 reasoning**：机械 compact 配置是 `reasoning: 'none'`（不删）。HuggingFace Responses 是少数会剥掉 reasoning replay 的例外。
5. **UI 折叠不是限制**：`ThinkingBlock` 的 auto-collapse 只改展示。

这套东西能挡住「思考写在 `reasoning_content` 或 `<think>` 里」的情况，**挡不住「思考模式已关，模型仍把中文自言自语写进 `content` / `text-delta`」**。后者正是小团宝现在的主症状。成熟开源项目对此几乎都没有可靠的内容清洗；它们最多扩一组 think 标签、再在展示层折叠。

对小团宝最大的工程缺口因此不是「再抄一个 Cherry 截断器」，而是：

- 先核实 `thinking.type = disabled` 是否真的进了 DeepSeek 请求体（默认思考是开的）；
- 无标签中文自言自语今天被测试**明确当成公开展示**；
- 一旦它进了 `agent_message`，下一轮会把它当业务回复喂回去。

---

## 一、DeepSeek 官方协议（V4 Flash / V4 Pro）

### 实现事实

V4 Flash 与 V4 Pro 共用同一张思考开关和 effort 表。思考模式**默认打开**，effort 默认 `high`。[官方 Thinking Mode](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)

| 目的 | OpenAI Chat Completions | Responses API |
| --- | --- | --- |
| 开关 | `{"thinking": {"type": "enabled/disabled"}}` | `{"reasoning": {"effort": "none/low/high/max"}}`（`none` 关思考） |
| 强度 | `reasoning_effort`: `low` / `high` / `max` | 同上 |

OpenAI SDK 必须把 `thinking` 放进 `extra_body`，否则会被 SDK 丢掉：

```python
extra_body={"thinking": {"type": "enabled"}}
```

[官方文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode) 写明了这一点。[Chat Completions schema](https://api-docs.deepseek.com/api/create-chat-completion) 把 `thinking.type` 的默认值标成 `enabled`。

思考内容走独立字段 `reasoning_content`，与 `content` 同级。是否回传取决于请求有没有 `tools`：

- **带 `tools`**：历史轮次的 `reasoning_content` **必须**完整回传，包括没有实际 tool call 的轮次；否则 API 返回 400。
- **不带 `tools`**：不必回传；传了也会被忽略，不进下一轮上下文。

effort 映射（Flash 与 Pro 一致）：`low→low`，`medium→high`，`high→high`，`xhigh→high`，`max→max`。

文档**没有**承诺：关闭思考后 `content` 一定不含 CoT、`<think>` 或中文自言自语。也**没有** DeepSeek 侧的 thinking token budget（那是 Gemini `thinkingBudget` 的概念）。`max_tokens` 限制的是整段生成，不会单独截断思维链。

### 对小团宝的判断

小团宝用的是 DeepSeek V4 Flash + 工具循环。这意味着：

1. 关思考必须显式发 `thinking.type = disabled`。漏发 = 默认思考开启。
2. 关思考成功时，官方期望 CoT 不再出现在 `reasoning_content`；它**不保证**模型不会把规划文字写进 `content`。
3. 若思考其实仍开着，且请求带 tools，下一轮必须回传 `reasoning_content`，否则 400。小团宝的 `restore-tool-reasoning.ts` 就是在补这条协议，不是在「限制自言自语」。

---

## 二、Cherry Studio 实际做了什么

快照：CherryHQ/cherry-studio [`aac4b35`](https://github.com/CherryHQ/cherry-studio/commit/aac4b350704c7bbfe045c9d6be10fd99de656a37)。

### 2.1 请求侧：按供应商写 thinking 开关

官方 DeepSeek 的 Chat Completions wire，off 模式只写 `thinking.type = disabled`；V4 Flash / Pro 另外带 `reasoningEffort`：

```27:42:/tmp/cherry-studio-research/cherry-studio/packages/provider-registry/src/providers/deepseek.ts
const v4ChatEffortWire = {
  off: { operations: [{ target: 'thinking.type' as const, value: { source: 'literal' as const, value: 'disabled' } }] },
  auto: {
    operations: [
      { target: 'thinking.type' as const, value: { source: 'literal' as const, value: 'enabled' } },
      { target: 'reasoningEffort' as const, value: { source: 'effort' as const } }
    ],
    effortMap: { auto: 'high' as const, ...v4EffortMap }
  },
  ...
}
```

注释写明：目标是 `@ai-sdk/deepseek` 的 camelCase `reasoningEffort`；snake_case 会被 SDK 的 zod **静默丢掉**。[源码](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/packages/provider-registry/src/providers/deepseek.ts#L25-L42)

CherryIN（转发层）用的是另一条 wire：`extra_body.thinking.type`。[源码](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/packages/provider-registry/src/providers/cherryin.ts#L22-L26)

2.0.4 changelog 记录过一次真实故障：DeepSeek auto thinking 曾发出非法 `thinking.type = "auto"`，被 AI SDK 类型校验拒绝，对话启动失败。[release notes](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/resources/cherry-studio/release-history.json)

每次请求的开关来自 `request.reasoningEffort ?? assistant.settings.reasoning_effort ?? 'default'`，再投影成 registry wire。[`buildAgentParams.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/buildAgentParams.ts#L227-L235)

**短请求强制关思考**（这是少数真正「不想看到思考」的工程限制）：

- 话题命名 / 笔记摘要：`reasoningEffort: 'none'`，注释写「short throwaway output never benefits from provider-default thinking」。[`aiGeneration.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/renderer/utils/aiGeneration.ts#L4-L6)
- 连通性探测：同样 `'none'`，避免思考 token 污染延迟测量。[`AiService.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/AiService.ts#L1361-L1369)

`/no_think` 后缀**不是给 DeepSeek 的**。`noThinkFeature` 只作用于 OVMS + MCP 工具；`qwenThinkingFeature` 只给不支持 `enable_thinking` 的 Qwen 服务商追加 `/think` 或 `/no_think`。[`noThink.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/noThink.ts#L68-L72) [`qwenThinking.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/qwenThinking.ts#L64-L73)

### 2.2 响应侧：从 text 里抽 `<think>`

Chat Completions 没有原生 reasoning 字段。Cherry 在该 endpoint（以及 Ollama）挂 `extractReasoningMiddleware`，默认标签名 `think`（gpt-oss 用 `reasoning`，gemini 用 `thought`，seed-oss 用 `seed:think`）：

```39:45:/tmp/cherry-studio-research/cherry-studio/src/main/ai/runtime/aiSdk/params/features/reasoningExtraction.ts
export const reasoningExtractionFeature: RequestFeature = {
  name: 'reasoning-extraction',
  applies: (scope) =>
    scope.endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS || scope.endpointType === ENDPOINT_TYPE.OLLAMA_CHAT,
  contributeModelAdapters: (scope) => [
    createReasoningExtractionPlugin({ tagName: getReasoningTagName(scope.model.id.toLowerCase()) })
  ]
}
```

[源码](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/reasoningExtraction.ts) [`getReasoningTagName`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/utils/reasoning.ts#L24-L29)

未闭合标签：插件必须排在 `simulateStreaming` 之前，这样 `wrapLanguageModel` 反转中间件后，extractReasoning 能包住模拟流，把模拟流产生的未闭合 `<think>` 收干净。测试覆盖了标签被拆成 `<thi` / `nk>…` / `</th` / `ink>` 的跨 chunk 情况。[测试](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/__tests__/reasoningExtraction.test.ts#L72-L82)

**Anthropic / Gemini / OpenAI Responses 不跑这套提取**。这些线上 reasoning 是结构化字段；字面 `<think>` 会留在 content 里。测试把这条门控钉死在 wire 而不是 provider 白名单上。[`internalFeatures.test.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/__tests__/internalFeatures.test.ts#L91-L158)

网关把 DeepSeek 风格的 `reasoning_content` 转成 AI SDK `reasoning` part，流式再发回 `delta.reasoning_content`。[`OpenAiMessageConverter.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/features/apiGateway/adapters/converters/OpenAiMessageConverter.ts#L165-L168) [`AiSdkToOpenAiSse.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/features/apiGateway/adapters/stream/AiSdkToOpenAiSse.ts#L159)

未找到：思考内容的字符 / token 上限、生成中途截断、无标签中文 CoT 清洗。

### 2.3 持久化与下一轮上下文

带 tools 时必须回传 `reasoning_content`。Cherry 给 `@ai-sdk/openai-compatible@2.0.72` 打补丁：assistant 消息**总是**带该字段（没有思考就发空字符串），匹配 `@ai-sdk/deepseek` 的行为。2.0.3 changelog 把这记成「修复 DeepSeek、GLM、Kimi、MiniMax 多轮 `reasoning_content must be passed back`」。[patch](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/patches/@ai-sdk__openai-compatible@2.0.72.patch#L9-L13)

DeepSeek Responses 方言另有一层：把回放的 reasoning part 标成 `rawReasoningContent: true`，否则 `@ai-sdk/openai` 会当「Non-OpenAI reasoning parts」丢掉，触发 #18150。[`deepseekResponsesReasoningReplay.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/deepseekResponsesReasoningReplay.ts)

机械 compact **故意不删 reasoning**：

```99:102:/tmp/cherry-studio-research/cherry-studio/src/main/ai/runtime/aiSdk/params/features/contextBuild.ts
    compact: {
      reasoning: 'none',
      emptyMessages: 'remove'
    },
```

注释：`Reasoning stays intact and provider adapters decide how to serialize it.` [源码](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/contextBuild.ts#L12-L13)

唯一会剥 reasoning replay 的是 HuggingFace Responses（上游 400）。DeepSeek V4 Flash 明确 `applies = false`。[`stripReasoningReplay.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/stripReasoningReplay.ts) [测试](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/__tests__/stripReasoningReplay.test.ts#L21)

`aiCore` 的 compact 配置**支持** `reasoning: 'all' | 'before-last-message' | 'none'`，但 Cherry 生产路径选 `'none'`。[`middleware.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/packages/aiCore/src/core/context/middleware.ts#L79-L86)

### 2.4 UI / 导出（展示，不是限制）

- `ThinkingBlock`：`thoughtAutoCollapse` 只控制展开。2.0.4 修过「关闭自动折叠无效」。[`ThinkingBlock.tsx`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/renderer/components/chat/messages/blocks/ThinkingBlock.tsx)
- 导出 Markdown：可选是否带思考；带的话剥掉开头 `<think>`，放进 `<details>`。[`ExportService.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/renderer/services/ExportService.ts#L264-L286)
- OpenRouter：流里去掉 `[REDACTED]` 占位，不是截断思考。[`openrouterReasoning.ts`](https://github.com/CherryHQ/cherry-studio/blob/aac4b350704c7bbfe045c9d6be10fd99de656a37/src/main/ai/runtime/aiSdk/params/features/openrouterReasoning.ts)

---

## 三、其他项目对照

### Open WebUI

[`middleware.py`](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/utils/middleware.py) 维护一组默认推理标签，比 Cherry 的单标签宽：

```python
DEFAULT_REASONING_TAGS = [
    ('<think>', '</think>'),
    ('<thinking>', '</thinking>'),
    ('<reason>', '</reason>'),
    ('<reasoning>', '</reasoning>'),
    ('<thought>', '</thought>'),
    ('<Thought>', '</Thought>'),
    ('<|begin_of_thought|>', '<|end_of_thought|>'),
    ('◁think▷', '◁/think▷'),
]
```

这是流式/展示分流，不是生成截断，也不是无标签中文 CoT 清洗。未找到 DeepSeek 专用 thinking token cap。

### Vercel AI SDK

官方中间件 `extractReasoningMiddleware({ tagName: 'think' })` 把标签从生成文本抽到 `reasoning`。[文档](https://sdk.vercel.ai/docs/ai-sdk-core/middleware#extract-reasoning)

DeepSeek R1 指南额外提到 `startWithReasoning: true`：第三方托管的 R1 常常**省略开头 `<think>`**，需要假定整段开头都是思考。[R1 cookbook](https://sdk.vercel.ai/cookbook/guides/r1)（该文已注明 `deepseek-reasoner` 于 2026-07-24 退役，现网应用 `deepseek-v4-pro`）。

Cherry 调用 `extractReasoningMiddleware` 时**没有**开 `startWithReasoning`。小团宝的 `createThinkTagSplitter` 同样要求看到 `<think>` 才分流。

### LobeChat / Continue

本次未在可溯源的 raw 路径上读到与 Cherry 同级的 DeepSeek thinking 限制实现（GitHub 代码搜索未授权，若干历史路径 404）。不把二手描述写成事实。

### 对照表

| 手段 | Cherry Studio | Open WebUI | AI SDK | 小团宝现状 |
| --- | --- | --- | --- | --- |
| 请求侧关思考 | 按供应商 wire 写 `thinking.type` / `extra_body` / `reasoningEffort` | 未在本次读到的 middleware 头核实 | 取决于 `@ai-sdk/deepseek` | `providerOptions.deepseek.thinking.type` |
| 结构化 `reasoning_content` 分流 | 有 | 有（reasoning details） | 有 | 有（`reasoning-delta`） |
| `<think>` 流式提取 | Chat Completions / Ollama | 多组标签 | `extractReasoningMiddleware` | `createThinkTagSplitter`（仅 `<think>`） |
| 未闭合标签 | middleware 顺序 + 跨 chunk 测试 | 标签扫描 | middleware | splitter 状态机 |
| 省略开头标签（`startWithReasoning`） | 未开 | 未核实 | 文档建议第三方 R1 开启 | 未做 |
| 无标签中文自言自语清洗 | **未找到** | **未找到** | **未找到** | **测试规定当作正文** |
| 无标签英文 CoT 清洗 | 未找到 | 未找到 | 未找到 | `stripEnglishChainOfThought` |
| 思考长度上限 | **未找到** | **未找到** | 无（DeepSeek 也无 budget） | 无 |
| 下一轮剥 reasoning | 默认保留；HF 例外 | 未在本次核实 | 带 tools 必须回传 | `restore-tool-reasoning` 主动补回 |
| UI 折叠 | `thoughtAutoCollapse` | 思考块 UI | `sendReasoning` | 前端 reasoning 通道 |

---

## 四、小团宝现状（对照用，非实现计划）

请求侧：DeepSeek 模型把 `thinking.type` 设为 `enabled` / `disabled`，默认 `enabled`（effort `medium`），由 `AI_MODEL_THINKING` 控制。[`agent-factory.ts`](../../apps/agent/src/agent-factory.ts) [`server.ts`](../../apps/agent/src/server.ts)

响应侧：

- `reasoning-delta` → `reasoning.delta`，不进公开回复。
- `text-delta` 里的 `<think>` → `createThinkTagSplitter()` 分到 reasoning。
- 英文长 run → `stripEnglishChainOfThought()`。
- 落盘公开回复 → `selectPublicReply()`，优先已分流的 public text。

[`public-reply.ts`](../../packages/ai-contracts/src/runtime/public-reply.ts) [`visible-reasoning.ts`](../../packages/ai-contracts/src/runtime/visible-reasoning.ts) [`mastra-headless.executor.ts`](../../apps/agent/src/mastra-headless.executor.ts)

关键测试把当前产品行为钉死了：

```67:84:apps/agent/src/public-reply-channel.spec.ts
it('treats thinking-disabled soliloquy in text-delta as public live text and persisted agent_message', ...)
expect(channels.livePublic).toBe(`${SOLILOQUY}${PUBLIC_REPLY}`)
expect(channels.persisted).toBe(`${SOLILOQUY}${PUBLIC_REPLY}`)
```

也就是：关思考之后，**没有标签的中文自言自语会成为对用户可见、并写入 `agent_message` 的正文**。英文和无标签 `<think>` 块已经被挡。

带 tools 时，`restore-tool-reasoning.ts` 会把上一轮 reasoning 补回 assistant 消息，以满足 DeepSeek 回传约束。这与 Cherry 的 openai-compatible patch 同方向，目的是正确性，不是限流。

---

## 五、对小团宝的判断

### 不要从 Cherry 期待的东西

Cherry **不能**当「关思考后不再自言自语」的现成解。它没有：

- 思考 token / 字符预算；
- 生成中途截断思维链；
- 无标签中文 CoT 分类器；
- 把 reasoning 默认踢出下一轮（DeepSeek + tools 反而必须留着）。

它真正工程化的是：**开关写对、通道分对、tools 回传写对、短请求强制 off**。展示折叠是第四层，不减少 token。

### 真正减少污染的手段（按优先级）

1. **确认 disabled 到了 wire。** DeepSeek V4 默认思考开启。OpenAI 兼容栈里 `thinking` 经常要走 `extra_body`；`@ai-sdk/deepseek` 会丢掉 snake_case `reasoning_effort`。小团宝只在 Mastra `providerOptions.deepseek.thinking` 上断言对象形状，没有抓包断言请求体。若 Mastra 没有把它映射进 body，用户关思考等于没关——这最像「关了还在自言自语」的根因。Cherry 专门为官方 DeepSeek 和 CherryIN 写了两条不同 wire，就是因为这个。

2. **结构化 / 带标签的思考不要进公开回复，也不要当业务历史。** 小团宝已经做了：`reasoning-delta` 和 `<think>` 不进 `agent_message`。继续保持。带 tools 时 reasoning 只应作为隐藏协议字段回传，不应渲染成对客消息。

3. **无标签中文自言自语是产品缺口，不是 Cherry 已解决的缺口。** 现有测试把它当成正文。Open WebUI 更宽的标签表、AI SDK 的 `startWithReasoning` 都只覆盖「有标签或整段开头都是 think」的形态。V4 Flash 关思考后的中文规划文字通常两样都不是。要挡，只能自己做启发式（例如工具调用前的独白、或「先…再…」规划腔），误伤真实中文回复的风险很高；Cherry 选择不做。

4. **不要用 `max_tokens` 当思考限制。** 官方 `max_tokens` 含最终答案。思考开着时先烧 reasoning，答案会被截断。Cherry 的压缩路径专门避过「预算耗在 thinking 上、summary 出不来」的坑。

5. **不要对 DeepSeek 套 Qwen 的 `/no_think`。** Cherry 把它关在 OVMS / Qwen 兼容层。官方 DeepSeek 开关是 `thinking.type`。

6. **短任务强制 off 值得抄。** 命名、探测、路由这类 throwaway 调用，Cherry 一律 `reasoningEffort: 'none'`。小团宝若有类似旁路模型调用，应同样强制 disabled，避免默认思考。

### 差距清单

| 优先级 | 差距 | 依据 |
| --- | --- | --- |
| P0 | 没有证据证明 `thinking.type=disabled` 进入 DeepSeek 请求体；官方默认 enabled | 官方文档；Cherry 分官方 / CherryIN 两条 wire；小团宝只测 providerOptions 对象 |
| P0 | 无标签中文自言自语进入 live public + `agent_message`，并成为下一轮历史 | `public-reply-channel.spec.ts` |
| P1 | `<think>` 提取只认一对标签，没有 Open WebUI 那组，也没有 `startWithReasoning` | Cherry `getReasoningTagName`；AI SDK R1 指南 |
| P1 | 带 tools 时 reasoning 回传依赖内存 map（200 条上限），不是消息上的稳定字段 | `restore-tool-reasoning.ts`；Cherry 选择无条件带 `reasoning_content` |
| P2 | 旁路短请求是否强制 disabled，未在本次逐文件核实 | Cherry `aiGeneration.ts` / `AiService.ts` |
| 不做 | 按 Cherry 去做思考长度截断 | 上游不存在该限制 |
| 不做 | 把 reasoning 从 DeepSeek tool 循环里剥掉 | 官方会 400；Cherry 专门补回 |

### 一句话

成熟项目规避 DeepSeek 自言自语的办法是：**把思考关进协议字段、把带标签的泄漏抽走、把短请求强制 off、带工具时按协议回传**。它们不在模型已经把中文独白写进 `content` 之后做可靠清洗。小团宝前半段已经对齐；当前痛点要么是 disabled 没进请求体，要么是无标签中文独白被当成了公开回复——Cherry Studio 对后者同样没有答案。
