# Hermes 对 DeepSeek 做了哪些兼容（对照小团宝无标签中文独白）

> 研究日期：2026-09-09  
> Hermes 源码：本机安装 [`~/.hermes/hermes-agent`](file:///Users/sigclr/.hermes/hermes-agent)（NousResearch Hermes Agent）  
> 用户本机配置：[`~/.hermes/config.yaml`](file:///Users/sigclr/.hermes/config.yaml)  
> DeepSeek 官方文档：[Thinking Mode](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode)  
> 范围：Hermes DeepSeek provider profile、Chat Completions 流式分流、`reasoning_content` 回放、展示层 `show_reasoning`；再与小团宝 `thinking: disabled` + `selectPublicReply` 对照。  
> 本文区分「Hermes 实现事实」和「对小团宝的判断」。不写密钥、不复述会话原文里的电话。

## 结论

Hermes **没有**对无标签中文过程稿做词表清洗。你在 Hermes 里用同一套 DeepSeek 却「从来没见过小团宝这个问题」，主要不是因为它更会删中文句，而是因为它把 DeepSeek **默认开思考**，让过程稿走 `reasoning_content`，再在展示层把思考藏起来。

小团宝此前主症状是反过来的：请求侧 **关思考**（`thinking.type=disabled`），模型把规划文字写进 `content` / `text-delta`，公开通道把它当成对客回复写入 `agent_message`。交接文档里的启发式（「具体回答：」「回应：」）打地鼠，Hermes 也没有这套东西可抄。

2026-09-09 管线已按 Hermes 对齐：**默认 `thinking.type=enabled` + `reasoningEffort=medium`**，退役别名改写成 `deepseek-v4-flash`，工具步缺思考时回传 `" "`。关思考仍可用 `AI_MODEL_THINKING=disabled`，但那是显式选择，不是默认。

可参考、且和交接文档路径 B 同向的，是 Hermes 的**通道工程**，不是词表。

---

## 一、本机 Hermes 实际怎么跑 DeepSeek

用户配置（[`config.yaml`](file:///Users/sigclr/.hermes/config.yaml)）：

| 项 | 值 | 含义 |
| --- | --- | --- |
| `model.default` | `deepseek-v4-flash` | 官方 V4 一等 ID，不是退役别名 `deepseek-chat` |
| `model.provider` | `deepseek` | 直连 `https://api.deepseek.com/v1` |
| `agent.reasoning_effort` | `medium` | **思考开着** |
| `display.show_reasoning` | `false` | **思考不给用户看** |

启动日志也印证：切到 `deepseek-v4-flash` 后 `reasoning_config resolved … {'enabled': True, 'effort': 'medium'}`。

所以对比实验本身就不对称：

- Hermes：思考 **on** + UI **藏** reasoning
- 小团宝（对齐后）：思考 **on**（可关）+ 公开通道只吃无工具步 `content`；思考走 `reasoning-delta` / 即时输出，不进 `agent_message`

同一模型、两种产品契约。关思考后 DeepSeek **不保证** `content` 里没有中文规划腔；官方文档只保证思考字段不再出 `reasoning_content`。

---

## 二、Hermes 对 DeepSeek 的兼容（实现事实）

源码都在本机 Hermes Agent 树里。下列路径相对 `~/.hermes/hermes-agent/`。

### 2.1 请求侧：V4 每次都显式写 `extra_body.thinking`

[`plugins/model-providers/deepseek/__init__.py`](file:///Users/sigclr/.hermes/hermes-agent/plugins/model-providers/deepseek/__init__.py)

DeepSeek V4 **省略 `thinking` = 服务端默认思考 ON**，随后强制「下一轮必须回传 `reasoning_content`」，和工具循环叠在一起就是著名 HTTP 400（Hermes issue #15700 / #17212 / #17825）。因此 profile 每次都写：

```
{"reasoning_effort": "<low|medium|high|max>",  # 仅 thinking enabled 时
 "extra_body": {"thinking": {"type": "enabled" | "disabled"}}}
```

规则：

- V4+（`deepseek-v4-*`，排除 `deepseek-v3*`）：发 `thinking`
- 无 `reasoning_config`：`thinking.type=enabled`，**不**带 `reasoning_effort`（让服务端用默认 high）
- `enabled: false`：只发 `thinking.type=disabled`，**丢掉 effort**（DeepSeek 关思考时带 effort 会拒）
- `xhigh` / `max` / `ultra` → 顶层 `reasoning_effort=max`
- 退役别名 `deepseek-chat` / `deepseek-reasoner` 在 [`hermes_cli/model_normalize.py`](file:///Users/sigclr/.hermes/hermes-agent/hermes_cli/model_normalize.py) 一律改写成 `deepseek-v4-flash`（2026-07-24 之后直连 API 发旧 ID 会 400）

测试钉死这条 wire：[`tests/plugins/model_providers/test_deepseek_profile.py`](file:///Users/sigclr/.hermes/hermes-agent/tests/plugins/model_providers/test_deepseek_profile.py)

### 2.2 响应侧：`reasoning_content` 和 `content` 分通道

流式热路径 [`agent/chat_completion_helpers.py`](file:///Users/sigclr/.hermes/hermes-agent/agent/chat_completion_helpers.py) `_call_chat_completions`：

1. `delta.reasoning_content` 或 `delta.reasoning` → `_fire_reasoning_delta`（思考通道）
2. `delta.content` 且本轮还没有 tool_calls → `_fire_stream_delta`（可见正文）
3. **一旦出现 tool_calls，压制 content 流式展示**（避免「我先调用工具…」和工具进度并排漏到用户）。被压制的 content 仍可能走 callback，供 `<think>` 抽取，不当成最终回复

落库 [`build_assistant_message`](file:///Users/sigclr/.hermes/hermes-agent/agent/chat_completion_helpers.py)：

- 从 `reasoning` / `reasoning_content` / `reasoning_details` / content 里的 typed `thinking` block / `<think>` 抽出思考，存独立字段
- 对 **存储的 `content`** 做 `strip_think_blocks`（多组标签 + 未闭合边界），避免思考进 transcript、压缩、标题、IM 投递
- 思考开着且本轮有 tool_calls、却没有原生 `reasoning_content` 时，钉 **`" "` 单空格**，不用 `""`（V4 Pro 空串 400，#17341）

展示层：`display.show_reasoning` 默认 true，本机关掉。关掉只影响 UI，不删协议字段。

标签清洗比小团宝宽：`<think>` `<thinking>` `<reasoning>` `<thought>` `<REASONING_SCRATCHPAD>`，流式用状态机 [`agent/think_scrubber.py`](file:///Users/sigclr/.hermes/hermes-agent/agent/think_scrubber.py) 处理跨 chunk 半截标签。仍然**只认标签**，不认「现在我需要回应用户」这类中文身份句。

### 2.3 下一轮：思考模式必须回传 `reasoning_content`

[`agent/message_sanitization.py`](file:///Users/sigclr/.hermes/hermes-agent/agent/message_sanitization.py) `apply_reasoning_content_policy`：

- DeepSeek / Kimi / MiMo thinking：**每条 assistant 消息**都要有 `reasoning_content`
- 已有空串 → 升级成 `" "`
- 跨供应商历史（别家的 `reasoning` 字段）**不**原样喂给 DeepSeek，改钉空格，避免把 MiniMax 思维链泄漏过去
- 切到 Mistral / Groq 等严格供应商时，**整键删掉**，否则 400/422「Extra inputs are not permitted」（#45655）

检测不靠模型名 alone：`provider == deepseek`、model 含 `deepseek`、host `api.deepseek.com` 任一即可。测试：[`tests/run_agent/test_deepseek_reasoning_content_echo.py`](file:///Users/sigclr/.hermes/hermes-agent/tests/run_agent/test_deepseek_reasoning_content_echo.py)

### 2.4 Hermes **没有**做的事

全树检索无「现在我需要」「具体回答：」「回应：」或无标签中文 CoT 分类器。和 Cherry Studio 一样：通道分流 + 标签抽取 + 协议回传，**不在 `content` 已经是中文独白之后做可靠清洗**。

---

## 三、和小团宝现状对照

| 手段 | Hermes（本机 DeepSeek） | 小团宝现状 | 对独白症状 |
| --- | --- | --- | --- |
| 默认思考 | **enabled**（`reasoning_effort: medium`） | **enabled**（`AI_MODEL_THINKING` 缺省 on，effort medium） | 开思考时过程稿进 `reasoning_content`，关思考时进 `content` |
| 开关 wire | 每次显式 `extra_body.thinking`；关则不带 effort | `providerOptions.deepseek.thinking` + `reasoningEffort`；关思考不带 effort | 协议测试钉 enabled/disabled 两条 wire |
| 模型 ID | 退役别名改写成 `deepseek-v4-flash` | 默认 `deepseek/deepseek-v4-flash`；`deepseek-chat` / `reasoner` 改写到同一 ID | 不再默认走退役别名的 non-thinking shim |
| 结构化 reasoning 分流 | `delta.reasoning_content` → 思考通道 | `reasoning-delta` → `reasoning.delta` | 两边都能挡住**带字段**的思考 |
| `<think>` | 多标签 + 流式状态机 | 仅 `<think>` | 关思考后的中文独白通常无标签 |
| 工具步 content | 有 tool_calls 就压制可见流 | `#491`：工具步中文独白不进公开通道 | 两边都挡工具步；**挡不住最终无工具步** |
| 最终无工具步的 `content` | 当可见回复（思考已在别的字段） | `selectPublicReply` 当公开回复；测试钉死无标签独白为正文 | **这是小团宝漏点** |
| 无标签中文清洗 | **没有** | 上一会话启发式已还原；交接明确不要再扩词表 | 抄 Hermes 抄不到词表 |
| 展示藏思考 | `show_reasoning: false` | 前端 reasoning 通道 | Hermes 用户看不到思考，不等于模型没想 |
| tools 回传 | 消息上稳定带 `reasoning_content`，缺则 `" "` | `restore-tool-reasoning.ts` 内存 map；工具步缺思考钉 `" "` | 对齐 Hermes 的 400 防护，不是独白清洗 |

关键测试（小团宝把当前产品行为钉死了）：

```67:84:apps/agent/src/public-reply-channel.spec.ts
it('treats thinking-disabled soliloquy in text-delta as public live text and persisted agent_message', ...)
```

也就是：关思考之后，没有标签的中文自言自语**应当**成为对用户可见、并写入 `agent_message` 的正文。Hermes 不会走进这条产品路径，因为思考默认开着，独白不在 `content` 里。

---

## 四、对小团宝的判断

### 不要从 Hermes 期待的东西

- 中文过程句分类器 / 「具体回答：」截取
- 「关思考后 content 一定干净」的保证
- 用 `max_tokens` 截思维链（Hermes 也没做；官方 `max_tokens` 含最终答案）

### 真正可参考的三件事

1. **通道，不是词表。** Hermes 让思考永远不进对客 `content`。交接文档路径 B（最终对客只走独立出口 / `replyPlaintext`）和这个同构：过程稿可以存在，但不能成为 `agent_message`。
2. **若继续关思考，不要幻想 DeepSeek 会把规划留在 `reasoning_content`。** 官方关思考后规划文字会挤进 `content`。这不是 Mastra 独有，是产品选择。Hermes 选择开思考 + 藏 UI，所以你「从来没见过」。
3. **已改为开思考对齐 Hermes。** 每轮显式 `thinking.type=enabled`、assistant 回传 `reasoning_content`（空则 `" "` 不是 `""`）、公开通道只吃无工具步 `content`。关思考仍是产品缺口：无标签中文独白会进 `agent_message`。开思考把缺口变窄，但不能当唯一开关——模型仍可能把一句「让我先核实」写进 `content`。

### 和交接文档怎么接

交接建议先对齐 A（重做启发式）还是 B（换通道）。Hermes 证据支持 **B**：成熟 Agent 对 DeepSeek 的兼容是协议字段 + 流式分通道 + 工具步压制可见 content，不是中文正则。启发式在 Hermes 里不存在，也不该作为小团宝的主方案。

若只想解释「为什么 Hermes 没这个问题」：因为本机 Hermes 思考是开的，独白不在你看到的那条气泡通道里。
