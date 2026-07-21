# 2026 AI 旅行社业务管理产品技术环境研究

> 研究日期：2026-07-21  
> 研究目的：为小团宝的 AI 产品战略、UI 改造和功能里程碑提供外部技术与治理依据。  
> 研究边界：仅采用协议组织、模型厂商、云厂商及政府机构的一手资料。本文讨论“现在能做什么、应如何落地”，不对任何单一供应商作采购背书，也不构成法律意见。

文中“事实”是来源可直接支持的能力或规则；“推论”是根据这些事实结合旅行社业务作出的产品判断。未标为“事实”的摘要、优先级、架构和指标均属于研究建议，仍需以真实用户、现有代码与数据验证。

## 1. 结论摘要

以下为综合研究推论。

截至 2026 年中，AI 产品竞争的主战场已经从“在页面旁边放一个聊天框”转向五个更具业务价值的层次：

1. **从回答问题到完成任务**：模型已经能在有约束的工具体系里检索、判断、调用业务动作，并留下完整追踪记录。
2. **从自由文本到业务对象**：结构化输出与原生文档理解，使合同、确认单、报价单、发票、行程 PDF 等资料可以直接进入现有业务模型。
3. **从键盘输入到现场多模态交互**：实时语音、图像与文档理解已经足以支持客服通话、导游现场助理、票据识别和跨语言沟通。
4. **从公共知识到权限内企业知识**：RAG 的关键不再只是“搜得到”，而是“只搜到当前租户、角色与项目有权看到的内容，并能显示出处”。
5. **从 Demo 到可运营系统**：评测、追踪、审批、权限、数据保留和生成内容标识已成为产品能力，而不是上线后的补丁。

**战略推论：**小团宝不应建设一个孤立的“AI 聊天功能”，而应建设一个贯穿产品的 **AI 工作层（AI Work Layer）**：用户可以在任何业务对象上理解、生成、比较、检查和发起动作；系统负责权限、引用、审批、追踪与评测。聊天只是其中一种交互形态。

## 2. 证据与产品推论

### 2.1 Agent 与工具调用：AI 已可进入业务流程，但必须受控

#### 事实

- OpenAI 于 2025-03-11 发布 Responses API、内置网页搜索、文件搜索、计算机使用和 Agents SDK；Agents SDK 同时提供 handoff、guardrail 与 tracing。[OpenAI：New tools for building agents，2025-03-11](https://openai.com/index/new-tools-for-building-agents/)
- OpenAI 于 2025-05-21 为 Responses API 增加远程 MCP、Code Interpreter、图像生成和后台任务；这表明长任务、工具编排与标准化外部连接已进入主流 API 产品面。[OpenAI：New tools and features in the Responses API，2025-05-21](https://openai.com/index/new-tools-and-features-in-the-responses-api/)
- Gemini 的 function calling 文档明确区分“模型决定调用什么”与“应用实际执行动作”；外部系统执行仍是应用方责任。[Google：Function calling with the Gemini API，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/function-calling)
- MCP 当前授权规范以 OAuth 2.1 为基础，要求受保护资源发现、目标资源绑定、Bearer Token、PKCE、精确回调地址等机制。[Model Context Protocol：Authorization 2025-11-25，访问于 2026-07-21](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- Google 在 2025-04-09 发布 A2A，目标是让不同厂商、框架的独立 Agent 发现能力、协商模态并协作；当前公开规范页面标注最新版为 0.3.0。[Google：Announcing the Agent2Agent Protocol，2025-04-09](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)；[A2A Protocol 0.3.0，访问于 2026-07-21](https://a2a-protocol.org/v0.3.0/specification/)

#### 推论

- **Agent 的正确产品定义是“有权限、可追踪、可撤回的业务执行器”，不是更聪明的聊天机器人。**小团宝可优先把“查资料、生成草稿、比较方案、预填表单”开放给 AI；涉及发消息、改价、确认预订、付款、开票、删除等动作，必须进入明确的人工确认层。
- 核心业务动作应先形成稳定、幂等、细粒度的内部工具契约，再按需暴露为 MCP；A2A 可作为未来与供应商、渠道或客户方 Agent 协作的边界，不应成为首期内部架构的前置依赖。
- 工具权限需沿用小团宝自身的租户、角色和资源权限，不能把模型 API Key 当成业务授权。所有写操作应记录“谁提出、AI 建议什么、谁批准、执行参数、执行结果”。

### 2.2 结构化输出与文档理解：可把非结构化资料接入业务对象

#### 事实

- OpenAI Structured Outputs 可以约束输出匹配开发者提供的 JSON Schema；官方同时明确提醒，结构正确不代表字段值在语义上一定正确。[OpenAI：Introducing Structured Outputs in the API，2024-08-06](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- Gemini 文档理解可对 PDF 的文本、图像、图表和表格进行联合理解，并直接提取为结构化输出；当前官方文档给出的上限为单个 PDF 50MB 或 1000 页。[Google：Document understanding，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/document-processing)
- Gemini 的 PDF embedding 会同时处理页面视觉与文本，扫描件会自动 OCR；这说明“先 OCR、再单独让 LLM 理解”的传统串联不再是唯一实现方式。[Google：Embeddings—Embedding documents，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/embeddings)

#### 推论

- 合同、供应商确认单、酒店房态表、交通票据、报价单、发票和行程 PDF 可进入统一的“上传 → AI 提取 → 规则校验 → 差异高亮 → 人工确认 → 写入业务对象”流程。
- UI 不应只展示 AI 的文字总结，而应展示**原文与字段的对应关系、置信状态、冲突、缺失项和最终写入差异**。对于价格、日期、人数、币种、取消政策等高风险字段，应同时做确定性业务校验。
- 文档抽取要保留原始文件、页码/区域引用、解析版本和人工修订记录；否则后续无法审计，也无法把人工纠错沉淀成评测集。

### 2.3 实时语音：客服、现场协作与翻译已具备工程可行性

#### 事实

- OpenAI 于 2025-08-28 宣布 Realtime API 正式可用于生产，并加入远程 MCP、图像输入和 SIP 电话接入；其 speech-to-speech 模型直接处理和生成音频，而不是强制经过独立 STT/TTS 管线。[OpenAI：Introducing gpt-realtime and Realtime API updates，2025-08-28](https://openai.com/index/introducing-gpt-realtime/)
- Gemini Live API 提供双向实时音频、Voice Activity Detection、可打断交互、多语言语音与 function calling；官方当前文档同时列出会话时长、上下文与客户端鉴权等限制。[Google：Live API capabilities，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- Gemini Live API 的工具调用可在实时连接中拉取外部上下文和执行函数，但不同预览模型对同步/异步工具调用支持仍有差异。[Google：Tool use with Live API，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/live-api/tools)

#### 推论

- 三类可行场景：① 客服电话实时转写、总结与工单草稿；② 领队/导游免手持语音查询团组信息、生成现场记录；③ 与境外供应商或旅客的低延迟口译。
- 首期应定位为“副驾驶”：AI 可听、译、查、记、建议，涉及承诺价格、确认预订、退款和支付仍由员工批准。
- 语音产品必须从第一天设计同意提示、录音状态、人工接管、敏感信息遮蔽、通话摘要确认和留存期限；不要把模型听懂当成业务事实已经确认。

### 2.4 多模态：现场资料可以直接成为业务输入

#### 事实

- 实时模型已能在语音会话中同时接受图像输入并调用外部工具。[OpenAI：Introducing gpt-realtime and Realtime API updates，2025-08-28](https://openai.com/index/introducing-gpt-realtime/)
- Gemini 的文档能力并非仅提取字符，还会理解 PDF 中的图表、图片、表格和版面。[Google：Document understanding，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/document-processing)
- Gemini 当前通用 API 支持文本、图像、音频、视频等多模态输入；其音频理解能力覆盖转写、翻译、说话人区分和带时间戳的片段分析。[Google：Audio understanding，访问于 2026-07-21](https://ai.google.dev/gemini-api/docs/audio)

#### 推论

- 小团宝可把“拍一张照片/上传一个文件/说一句话”统一为业务入口：识别餐标、房型、菜单、收据、车牌、集合点、现场异常，并关联到团、日程、供应商和费用。
- 多模态识别适合发现候选信息和异常，不适合单独决定赔付、付款或供应商责任。产品必须显示证据原图、提取结果和人工确认状态。
- 对旅客证件、名单、健康信息等高度敏感资料，应默认最少上传、最短留存和字段级脱敏，并限制模型与工具可见范围。

### 2.5 RAG、企业数据与权限：检索权限必须前置

#### 事实

- Vertex AI Search 官方定位覆盖网站、非结构化文档和结构化数据上的搜索与 RAG，并提供语义搜索、生成式摘要和会话搜索。[Google Cloud：About Vertex AI Search，最后更新 2026-01-02](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/vertex-ai-search)
- Gemini Enterprise 的自定义数据源访问控制通过身份提供方识别用户，并依据文档 ACL 决定可返回的搜索结果；Cloud Storage/BigQuery 文档可携带 `acl_info`，数据存储需启用 `aclEnabled`。[Google Cloud：Configure access controls for custom data sources，访问于 2026-07-21](https://docs.cloud.google.com/gemini/enterprise/docs/identity)
- OpenAI API 默认不使用 API 输入和输出训练模型，但不同 endpoint/tool 的应用状态、默认保留期与 Zero Data Retention 资格并不相同；远程 MCP 还受第三方服务器自身的数据政策约束。[OpenAI：Data controls in the OpenAI platform，访问于 2026-07-21](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- OpenAI 官方企业隐私说明亦确认，API 和企业产品默认不使用组织数据训练模型。[OpenAI：Enterprise privacy，更新于 2026-01-08](https://openai.com/enterprise-privacy/)

#### 推论

- “不用于训练”不等于“不存储”。供应商选型和架构评审必须逐项核对 endpoint、tool、地区、保留期、第三方 MCP 和删除机制，不能只依据一条总括式隐私声明。
- 小团宝 RAG 必须在**检索前**执行租户、角色、项目/团、部门和文档 ACL；禁止先检索整个库再让模型隐藏无权内容。
- 每个回答需附业务来源、文档版本和更新时间；时效性强的航班、签证、天气、景点开放状态应与权威实时来源分开标识，不能与内部静态知识混为一谈。
- 推荐采用“结构化业务查询 + 权限感知文档检索 + 外部实时查询”的三路上下文，而不是把所有数据复制进单一向量库。

### 2.6 评测、可观察性与治理：可靠性需要产品化运营

#### 事实

- Microsoft Foundry 将生产 AI 可观察性拆为 evaluation、monitoring 和 tracing；其评测指标覆盖 groundedness、relevance、安全、工具调用准确率和任务完成，追踪覆盖模型调用、工具调用与跨服务依赖。[Microsoft：Observability in generative AI，最后更新 2026-03-28](https://learn.microsoft.com/en-us/azure/foundry/concepts/observability)
- Microsoft 的 Agent Monitoring Dashboard 支持对生产流量采样做持续评测，并监控 token、延迟、成功率、评测结果与红队扫描。[Microsoft：Monitor agents with the Agent Monitoring Dashboard，访问于 2026-07-21](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/how-to-monitor-agents-dashboard)
- NIST 的 Generative AI Profile 是 AI RMF 1.0 的跨行业配套，目标是把可信与负责任 AI 风险纳入设计、开发、使用和评估生命周期。[NIST AI 600-1，发布于 2024-07-26、更新于 2026-04-08](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)

#### 推论

- 小团宝需要 AI 控制台，而不只是调用日志：模型/提示版本、成本与延迟、工具成功率、人工改写率、引用命中率、字段准确率、越权测试、拒答/升级率都应可追踪。
- 上线门槛应由旅行社真实任务评测集决定，而不是厂商通用 benchmark。评测集应至少覆盖日期/时区、币种、人数、房型、交通衔接、取消政策、重复预订、权限越界、提示注入和工具失败。
- 每次员工修改 AI 结果，都应被记录为“候选失败样本”；经脱敏和审核后进入回归评测，而不是未经治理地直接用于训练。

## 3. 监管与产品治理约束

### 3.1 中国大陆

#### 事实

- 《生成式人工智能服务管理暂行办法》自 2023-08-15 施行，适用于向中国境内公众提供生成内容的服务；其要求包括合法数据来源、个人信息处理依据、准确可靠、输入与使用记录保护、投诉举报等。企业内部研发应用且未向境内公众提供服务，不直接落入该办法第二条所述公众服务范围。[国家网信办等：《生成式人工智能服务管理暂行办法》，发布于 2023-07-13](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)
- 《人工智能生成合成内容标识办法》与强制性国家标准于 2025-09-01 同步施行，要求特定生成合成内容具有显式、隐式标识，并禁止恶意删除或篡改标识。[国家网信办等：《人工智能生成合成内容标识办法》发布说明，发布于 2025-03-14](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm)

#### 推论

- 若小团宝仅提供内部员工副驾驶，与直接面向旅客提供公众生成式服务的义务边界不同；一旦上线旅客端 AI 客服、公开生成行程或营销内容，应重新进行适用性审查。
- 所有对外 AI 内容应预留显式标签和文件元数据标识能力；对旅客个人信息、护照资料和通话录音，应单独完成合法性、必要性、跨境与留存评估。

### 3.2 欧盟及跨境业务

#### 事实

- 欧盟 AI Act 于 2024-08-01 生效；禁止性实践与 AI 素养义务自 2025-02-02 适用，GPAI 治理义务自 2025-08-02 适用。欧盟委员会当前页面显示，更多透明度义务自 2026-08-02 起适用，同时部分高风险规则的时间表仍受后续简化立法进程影响。[European Commission：AI Act，访问于 2026-07-21](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- AI Act 第 50 条相关透明度规则要求在特定情形下告知用户正在与 AI 系统互动，并对 AI 生成/操纵内容提供机器可读标记。[European Commission：Transparency obligations under Article 50，访问于 2026-07-21](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act)

#### 推论

- 面向欧洲旅客或当地员工的功能需要可配置的 AI 身份披露、人工接管、生成内容标记、操作日志和员工 AI 素养培训。
- 目前 EU 时间表仍存在立法调整，任何欧洲市场上线应在发布前由合格法律顾问复核届时生效文本，不应把本研究日期的委员会说明当成永久结论。

## 4. 对小团宝最有价值的能力优先级

以下优先级是基于技术成熟度、旅行社业务价值和风险控制难度作出的**研究推论**，需与小团宝现有代码、用户访谈和数据质量进一步校准。

| 优先级 | 能力方向 | 首个可验证成果 | 技术成熟度判断 | 主要风险 |
|---|---|---|---|---|
| P0 | AI 文档录入与差异核对 | 合同/确认单/报价单提取到业务草稿，原文引用、规则校验、人工确认 | 高 | 字段语义错误、旧版本覆盖 |
| P0 | 权限感知业务问答 | 在当前租户/团/项目权限内回答并引用来源 | 高 | 越权检索、过期资料 |
| P0 | 上下文副驾驶 UI | 在行程、报价、供应商、费用等对象上给出摘要、缺失项、下一步 | 高 | 通用聊天与业务脱节 |
| P1 | 受控任务 Agent | 预填表单、生成消息、创建待办；所有写操作需确认 | 中高 | 误操作、重复执行、提示注入 |
| P1 | AI 质检与异常哨兵 | 检查价格/日期/人数/库存/政策冲突并给证据 | 中高 | 误报疲劳、规则不完整 |
| P1 | 客服与供应商沟通助手 | 通话转写、摘要、翻译、回复草稿、工单关联 | 中高 | 同意、录音留存、错误承诺 |
| P2 | 导游/领队实时语音助手 | 免手持查询、现场记录、多语翻译、异常上报 | 中 | 网络、噪声、延迟、敏感信息 |
| P2 | 外部供应商 Agent 互联 | 通过受控 MCP/A2A 查询与协作 | 中低 | 标准变动、第三方权限与责任 |

## 5. 推荐的技术与产品底座

### 5.1 统一 AI Gateway

- 隔离模型供应商差异，按任务在文本、视觉、语音、推理模型之间路由。
- 集中处理租户上下文、脱敏、速率限制、成本预算、保留策略和审计。
- 业务代码依赖内部能力接口，不直接散落供应商 SDK。

### 5.2 受控 Tool Registry

- 每个工具声明输入/输出 Schema、所需权限、风险级别、是否幂等、是否需人工批准。
- 读工具默认最小权限；写工具采用预览差异、二次确认、幂等键和可补偿操作。
- 外部 MCP/A2A 连接进入独立信任域，不能继承小团宝服务器的广泛凭证。

### 5.3 权限感知 Context Engine

- 将结构化业务查询、文档 RAG 和实时外部来源分开编排。
- 检索前完成 tenant/role/resource ACL；输出保留来源、版本、时间和可见性标签。
- 对签证、航班、开放时间、天气等时效知识显示“截至何时”，并允许用户回到原始来源。

### 5.4 AI Control Plane

- 模型、提示、工具和知识库版本注册。
- 端到端 trace、成本/延迟/成功率与人工修改反馈。
- 离线回归评测、发布门禁、生产抽样评测、红队测试和事故回滚。
- 数据保留、删除、用户同意、AI 披露、生成内容标识和供应商清单。

## 6. 建议验证指标

不要只看“使用次数”或“对话数”。建议每项能力至少绑定一个业务结果与一个安全指标：

| 场景 | 业务指标 | 质量/安全指标 |
|---|---|---|
| 文档录入 | 单份资料处理时长、人工录入字段数下降 | 关键字段准确率、引用覆盖率、人工改写率 |
| 权限问答 | 找资料耗时、一次解决率 | 越权泄露率必须为 0、无来源回答率 |
| 行程/报价助手 | 方案制作周期、复用率、毛利异常提前发现数 | 日期/币种/人数/政策错误率 |
| 任务 Agent | 人工步骤减少、任务完成率 | 未授权写操作率必须为 0、重复执行率 |
| 沟通助手 | 通话后处理时长、回复时长 | 错误承诺率、人工接管率、敏感信息暴露率 |
| 异常哨兵 | 异常提前发现时间、避免损失 | 误报率、漏报率、告警采纳率 |

## 7. 关键反模式

1. **全站一个万能聊天框**：缺少业务对象、证据和动作状态，难以形成可验证价值。
2. **让模型直接写数据库**：绕过领域规则、权限、幂等和审计。
3. **把所有数据放进同一向量库**：容易造成跨租户、跨角色和过期版本混用。
4. **把 Schema 合规当作事实正确**：结构化输出仍需业务规则和人工确认。
5. **只在上线前做一次评测**：模型、提示、知识和工具都在变化，必须持续回归。
6. **把“不用于训练”当作零保留**：endpoint、工具和第三方连接有各自保留与传输规则。
7. **首期就追求全自动**：旅行社业务包含价格、承诺、支付和旅客安全，先以副驾驶与受控动作建立信任。

## 8. 研究结论

技术已经足以让小团宝成为“AI 原生的旅行社业务操作系统”，但高度不来自堆叠模型功能，而来自三件事：

- AI 是否深入现有业务对象与流程，而不是停留在对话层；
- 每个结论和动作是否有权限、证据、审批与追踪；
- 团队是否能用真实业务评测持续证明它更快、更准、更安全。

因此，最稳健的演进顺序是：**上下文 UI 与文档智能 → 权限知识与质检 → 受控 Agent → 实时语音与外部 Agent 协作**。这条路径既利用了 2025—2026 年成熟的多模态和 Agent 能力，也把旅行社业务中的价格、承诺、支付、个人信息与旅客安全风险控制在可运营范围内。
