# Mastra 1.57.x 上下文工程能力核查

> 核查日期：2026-08-21  
> 本地版本：`@mastra/core@1.57.0`  
> 官方源码快照：Mastra [`1e47b7520cab4cfaa8daed52f17e2e6d14ff7539`](https://github.com/mastra-ai/mastra/tree/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539)  
> 范围：只使用本地安装包、Mastra 官方文档、官方源码和官方 changelog。本文将“框架事实”与“小团宝采用建议”分开。

## 结论

Mastra 确实有类似 Codex“上下文接近窗口时自动优化”的正式能力，名称是 **Observational Memory（OM）**：按 Token 阈值把旧消息和工具结果压缩成 observations，再按第二个阈值用 Reflector 重写、压缩 observations。默认 Observer 阈值为 30,000，Reflector 阈值为 40,000；异步 buffering 默认开启，正常情况下可以提前生成摘要并在阈值到达时切换，避免临界点才阻塞。[官方说明](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/observational-memory.mdx) [官方 API](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/reference/memory/observational-memory.mdx)

但它不是“给现有 Agent 加一个 TokenLimiter”就自动得到的能力：

- `TokenLimiterProcessor` 只做估算、删除消息和兜底报错，**不生成摘要**。
- OM 需要额外安装 `@mastra/memory`、接入受支持的持久化存储，并以稳定的 `resource/thread` 使用 Mastra Memory。
- OM 压缩的是 Mastra 保存的消息历史和工具结果，不认识小团宝的 `ContextManifest`、资料版本、业务快照、权限事实和候选证据。
- OM 的正常触发面是逐步增长的历史/工具循环；它不是“在首个模型请求前把一条超大新消息透明拆分并无损摘要”的入口。
- OM 的 observation/reflection 都是模型生成内容，适合保持会话连续性，不应成为业务事实、授权或证据的单一真相源。
- 当前小团宝 Agent 只安装了 `@mastra/core`，创建 Agent 时也没有配置 `memory` 或 `inputProcessors`，因此 **现在既没有 OM 自动压缩，也没有 TokenLimiter 安全网**。[依赖](../../apps/agent/package.json#L12-L18) [Agent 配置](../../apps/agent/src/mastra-agent.ts#L18-L33)

对现有架构的建议是：**可以把 OM 作为“技术会话历史压缩层”做 PoC，但保留 PostgreSQL Workflow Worker、`AiConversationEvent` 和 `ContextManifest` 为权威控制面；不要让 OM 接管业务状态或证据。**

## 能力矩阵

| 能力 | Mastra 1.57.x 是否具备 | 真实边界 |
|---|---|---|
| 每次模型调用前估算 Token | 有 | `TokenLimiterProcessor` 使用 `tokenx` 启发式估算，不是 DeepSeek 官方 tokenizer |
| 多步工具循环持续控长 | 有 | `processInputStep()` 在每个 step、工具续步前执行 |
| 自动摘要旧对话 | 有，但需启用 OM | Observer 压缩旧消息与工具结果；需要 `@mastra/memory` 和持久化存储 |
| 摘要再次压缩 | 有 | Reflector 在 observation 达阈值后重写整个 observation log |
| 后台预压缩 | 有 | 默认按阈值比例异步 buffering；必要时有同步路径兜底 |
| 当前超长单条 User 消息自动无损压缩 | 没有 | TokenLimiter 不能拆分或摘要单条消息；OM 面向逐步增长的已存历史 |
| System Prompt 计入限制 | TokenLimiter 有 | 统计所有 system messages；system 本身超限会 `TripWire` |
| 工具 Schema 计入限制 | 未见保证 | TokenLimiter 实现只读取 system messages 与 message list；工具定义单独传给模型 |
| 业务优先级裁剪 | 没有 | TokenLimiter 只按消息新旧和 `best-fit/contiguous`；OM 由 Observer 模型提炼 |
| 可审计的业务上下文清单 | 没有 | OM 有自身持久记录/事件，但不生成小团宝业务 `ContextManifest` |
| Working Memory | 有，但需 Memory | 小型持久 scratchpad；不是全文历史压缩，也不是业务数据库替代品 |

## 一、TokenLimiterProcessor：安全网，不是 compaction

本地 `@mastra/core@1.57.0` 的实现与类型都表明：

1. 使用 `tokenx.estimateTokenCount()`，`encoding` 参数已废弃且被忽略，所以得到的是快速估算值，不是 DeepSeek 服务端精确 Token 数。[官方源码 L12-L19、L135-L137](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/packages/core/src/processors/processors/token-limiter.ts#L12-L19)
2. 它在 `processInputStep()` 中对每次 Agent loop step 执行，包括工具调用续步；这能防止工具结果不断累积导致指数式膨胀。[官方源码 L139-L147](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/packages/core/src/processors/processors/token-limiter.ts#L139-L147) [官方 changelog](https://mastra.ai/blog/changelog-2026-03-12)
3. 所有 System Message 永远保留；System 本身超过 limit，或没有任何普通消息可放入剩余预算时，直接抛出不可重试 `TripWire`。[官方源码 L161-L181、L205-L212](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/packages/core/src/processors/processors/token-limiter.ts#L161-L181)
4. 对普通消息从新到旧选取，最终直接从本轮 `messageList` 删除未选中的消息，不产生摘要。[官方源码 L183-L220](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/packages/core/src/processors/processors/token-limiter.ts#L183-L220)
5. 默认 `trimMode: 'best-fit'`：过大的新消息放不下时会继续尝试更老、更小的消息，可能形成有缺口的历史；`contiguous` 才保证连续后缀，但最新消息本身放不下时会直接没有可用消息并触发 `TripWire`。[官方源码 L119-L132、L187-L212](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/packages/core/src/processors/processors/token-limiter.ts#L119-L132)

因此小团宝若引入它，建议使用 `trimMode: 'contiguous'` 作为最后一道防线，避免把本轮 User 消息删掉后反而保留旧消息；但它不能承担“自动优化上下文”的主体职责。

另一个必须预留的误差是：实现明确统计 System 和消息内容，但没有把模型调用时另传的工具 Schema 加入同一个预算；工具 Schema、供应商包装和输出余量仍应由小团宝单独预留。`@mastra/core@1.57.0` 已把实际工具定义写入 `MODEL_GENERATION` trace，这可用于观测和校准，但不是硬预算证明。[本地 1.57.0 changelog](../../apps/agent/node_modules/@mastra/core/CHANGELOG.md#L17-L32)

## 二、Observational Memory：Mastra 的自动上下文压缩

OM 的上下文分为“压缩后的 observation log”和“尚未压缩的最近原始消息”：

1. 原始消息达到 `observation.messageTokens`（默认 30,000）时，Observer 把旧消息和工具结果转换为密集 observations，并从模型可见窗口移除已观察的原始消息；原始消息仍保存在 storage 中。[官方说明](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/observational-memory.mdx#how-it-works)
2. Observations 达到 `reflection.observationTokens`（默认 40,000）时，Reflector 重写整个 observation log，合并、压缩和清理旧内容，使 observation 区域保持有界。[官方说明](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/observational-memory.mdx#reflections)
3. 默认 `bufferTokens: 0.2` 会在约每 20% Observer 阈值时后台预生成 observation；达到正式阈值后激活已缓存结果。若 buffering 没跟上，仍可能走同步 Observer 路径，所以它降低但不能绝对消除停顿。[官方 API](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/reference/memory/observational-memory.mdx#configuration)
4. 可通过 `activateAfterIdle`、`activateOnProviderChange`、`blockAfter`、`previousObserverTokens` 和 `shareTokenBudget` 调节激活与压缩；其中 `shareTokenBudget` 暂时要求关闭异步 buffering。[官方 API](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/reference/memory/observational-memory.mdx#configuration)
5. 正常压缩会失去原始措辞；`retrieval: true` 可保留 observation group 到原始消息的指针，并注册 `recall` 工具按需查看原文，但这仍是 Mastra 消息历史的追溯，不等于小团宝资料证据链。[官方说明](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/observational-memory.mdx#retrieval-mode)

当前小团宝 Worker 会把冻结投影、历史和本轮输入组装成一条 `userText` 后调用 Agent；对 TokenLimiter 而言它是一条不可细分的 message，整条放不下时只能删除或 `TripWire`，OM 也不能把这种首步巨型输入自动变成可审计的分块结果。[当前组装与调用](../../apps/api/src/modules/ai-create-task/ai-workflow.processor.ts#L645-L739)

### API 形态

```ts
import { Agent } from '@mastra/core/agent'
import { TokenLimiterProcessor } from '@mastra/core/processors'
import { Memory } from '@mastra/memory'

const agent = new Agent({
  // ...
  memory: new Memory({
    storage,
    options: {
      observationalMemory: {
        model: observerModel,
        scope: 'thread',
        observation: {
          messageTokens: 30_000,
          bufferTokens: 0.2,
          bufferActivation: 0.8,
        },
        reflection: { observationTokens: 40_000 },
        retrieval: { scope: 'thread' },
      },
    },
  }),
  inputProcessors: [
    new TokenLimiterProcessor({ limit: hardInputBudget, trimMode: 'contiguous' }),
  ],
})
```

这只是说明框架 API，不能直接作为小团宝生产配置：阈值必须结合 DeepSeek 实际上下文窗口、System/工具开销、输出余量和真实调用 usage 校准。

## 三、Working Memory 与 memory processors

Working Memory 是 thread 或 resource 级持久 scratchpad，可用 Markdown template 或 schema 保存“持续相关的小型信息”。默认由主 Agent 通过工具更新；也可以设置 `observationalMemory.observation.manageWorkingMemory`，由 Observer 抽取并更新。[官方 Working Memory](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/working-memory.mdx) [OM working-memory updates](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/observational-memory.mdx#working-memory-updates)

它适合保存“当前任务、开放问题、User 偏好”等提示性状态，不适合保存：

- 已确认的业务草稿权威值；
- 权限、组织归属和动作授权；
- 资料解析版本和候选证据；
- 需要 CAS、事务或不可变审计的工作流状态。

Mastra Memory 会把 `MessageHistory`、`WorkingMemory`、`SemanticRecall` 等 processors 插入 Agent pipeline；应用自己的 `inputProcessors` 在 Memory processors 之后运行，因此 TokenLimiter 可以在历史和 working memory 注入后做总的消息级兜底。[官方 Memory Processors](https://github.com/mastra-ai/mastra/blob/1e47b7520cab4cfaa8daed52f17e2e6d14ff7539/docs/src/content/en/docs/memory/memory-processors.mdx#processor-execution-order)

## 四、与小团宝 PostgreSQL / ContextManifest 的边界

### OM 可以负责

- 压缩 Mastra 技术会话中的旧 User/Assistant 消息和冗长工具结果；
- 在长对话中保留当前任务与连续性提示；
- 提供 Token 进度、observation/reflection 生命周期和模型 usage，辅助容量观测；
- 配合 `retrieval` 在摘要后按需回看原始消息。

### OM 不能负责

- 冻结 `conversationVersion`、资料解析版本和业务草稿版本；
- 证明本次模型实际使用了哪些资料片段、业务事实和权限快照；
- 保证 observation 没有遗漏或误写业务事实；
- 作为审核候选、User 确认、AI Action 或最终建团结果的权威状态；
- 取代现有 PostgreSQL Worker 的租约、重试、CAS、原子提交和跨进程恢复。

所以推荐的单一真相边界是：

```text
PostgreSQL 业务事件 / Workflow / ContextManifest（权威、可重放、可审计）
                         ↓ 受控投影
Mastra 原始消息 + OM observations（模型上下文优化、非权威）
                         ↓ 每次调用
Context Builder 重新注入当前权威业务事实 + TokenLimiter 最终兜底
```

OM 生成的摘要应作为一种有来源的派生上下文：记录 OM 配置版本、Observer/Reflector 模型、输入消息范围、输出摘要 hash 和 lifecycle 结果；但即使记录这些，也不应让摘要替换原始业务事件或证据。

## 五、对 Q24 的建议修订

“当前消息超限就不运行”不应是正常路径，但仍需保留不可规避的最终硬边界。推荐改成四级机制：

1. **软阈值观测**：每次 step 统计估算 Token，并保存供应商返回的实际 usage 校准；预算明确预留 System、工具 Schema 和输出空间。
2. **自动压缩旧上下文**：接近软阈值时优先压缩旧消息、旧工具结果和可重新读取的资料摘录；当前 User 消息、未完成审核状态、权限/安全约束和本轮固定业务事实不静默删除。
3. **按需回读**：压缩后的历史保留原始消息/资料定位，Agent 需要原话或证据时走受控 retrieval/tool，而不是把全部内容重新塞回窗口。
4. **硬边界失败**：完成压缩后仍超限，或单条当前 User 消息自身超过剩余窗口时，不能静默截断后执行。系统应先把完整原文持久化为输入资料，执行“无损分块 → 分块抽取 → 带 locator 的结构化合并”，主 Agent 只接收合并结果与引用；只有该流程也失败时才进入可恢复的“需要拆分/结构化处理”状态。模型摘要不得替代授权、金额、日期、身份或其他决定性原文，且必须能回链原始区段。

首批建议先实现第 1、2、3 层的应用级契约与观测，再对 OM 做隔离 PoC。PoC 的通过条件至少包括：

- 同一 thread 长对话和多步工具结果确实被压缩，当前 User 消息不丢失；
- observation 错写不会覆盖 PostgreSQL 权威事实；
- Worker 重启、跨实例续跑和失败路径不破坏现有批次/attempt 语义；
- `ContextManifest` 仍能证明最终模型输入的业务材料，并能区分原文、OM 摘要和按需回读内容；
- DeepSeek 下的延迟、额外模型费用、压缩率和事实保真率达到可接受标准。

## 本地版本证据

- `@mastra/core` 锁定为 `^1.57.0`，实际安装包版本为 `1.57.0`：[package.json](../../apps/agent/package.json#L12-L18)；[安装包 package.json](../../apps/agent/node_modules/@mastra/core/package.json#L1-L7)。
- 本地 `TokenLimiterProcessor` 类型说明其使用 `tokenx`、每 step 运行、保留 System，并定义 `best-fit/contiguous`：[本地类型](../../apps/agent/node_modules/@mastra/core/dist/processors/processors/token-limiter.d.ts#L7-L68)。
- `@mastra/core@1.57.0` changelog 记录了工具 Schema trace、`processToolResult` 和 1.57.0 变更：[本地 changelog](../../apps/agent/node_modules/@mastra/core/CHANGELOG.md#L3-L43)。
- 当前 `apps/agent` 未依赖 `@mastra/memory`，Agent 未配置 `memory`、`inputProcessors` 或 `outputProcessors`：[依赖](../../apps/agent/package.json#L12-L18)；[Agent](../../apps/agent/src/mastra-agent.ts#L23-L33)。
