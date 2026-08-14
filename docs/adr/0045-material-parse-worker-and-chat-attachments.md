---
status: partially superseded by ADR-0046
---

# 发团资料在隔离 Worker 解析，协助附件只传档案指针

> **ADR-0046 部分取代本 ADR。** 「不可信原件在隔离解析服务处理、StoredObject/档案/解析结果归平台持有、Agent 只接收档案指针、解析完成前不得编造候选、不引入 Redis/BullMQ」继续有效；API 进程内 fire-and-forget、浏览器轮询后续跑、按本次窗口或活动运行开始时间隔离档案的机制不再采用。新的可靠性边界是持久化会话、不可变输入批次、PostgreSQL 作业与后台 Worker。

发团基础信息可用图片或 PDF 辅助填写，但原件不可信、也不可进 NestJS 主进程。决定：`services/ocr` 作为内部资料解析 Worker，PDF 由 `pdf-inspector==1.14.2` 按页路由（可信原生文本直接提取，`needsOcr` 页再渲染进 RapidOCR），对外只暴露小团宝 `POST /v1/parse`；NestJS 持有发团资料档案、解析运行与证据，用解析运行行排队并以后台 HTTP 送字节，不引入 Redis/BullMQ，也不把 pdf-inspector 装进 API。第一版只从 CopilotChat 附件建档：输入框附加只做本地预览，User 发送后才写入 StoredObject（含 SHA-256）并排队解析；Agent 调模型前丢掉 file/image part，只保留档案指针。本轮用户文字由模型处理，附件由 Worker 解析；齐套后再经 `getTaskContext` / `getMaterialParseResult` 消费并走既有审核包，解析未完成不得根据预览编造候选。关闭协助窗口再打开是新的活动运行与聊天线程：`getTaskContext` / `getMaterialParseResult` 只暴露该运行开始之后的档案，表单审核区仍可预览任务内已有档案。

**Considered Options**

- 全页 RapidOCR、或 RapidOCRPDF 兼做原生提取：扫描件能用，但原生文本页白烧 OCR，也留不下 PDF point 证据。
- `@firecrawl/pdf-inspector` 进 NestJS：不可信 PDF 会占满事件循环并拖垮业务 API。
- 表单另做上传，或把附件 base64/可抓取预览 URL 交给视觉模型：两套入口，且绕过解析配置与不可信输入边界。
- #300 先上无头 Agent Runtime：与现有 CopilotKit 会话模型重复，本票不需要。
