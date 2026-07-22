---
status: accepted
---

# 附件走 S3 兼容对象存储与平台 StoredObject

产品中心需要持久保留导入原件（及后续详细行程 Word 等不可再生附件），而现有 `UPLOAD_DIR` 本地盘无法支撑多环境一致与可换云。决定：引入平台级 **FileStore**（S3 兼容 API）与 **StoredObject** 元数据（按 Organization 隔离，业务表引用其 id）；开发与 Compose 类生产使用 **Garage**；应用只依赖可移植 S3 子集（Put/Get/Delete/Head，预签名为扩展点），正式切流前可迁 **阿里云 OSS** 等国内 S3 兼容服务，不绑厂商 SDK。

**不采用** MinIO Community Edition 作为新基建：其社区仓库已 archived / 不再维护，不适合新建依赖。亦不以 Cloudflare R2 为开发期默认桶（与当前 Compose 单机、少绑 CF 数据面一致）。

## Considered Options

- **继续本地盘 / 仅抽象接口、P0 仍落盘**：拒绝。产品中心「原件可回看」会把真相绑在单机卷上。
- **MinIO CE**：拒绝。开源侧已停更，供应链与补丁风险不可接受。
- **预签名直传为 P0**：拒绝。附件体量小，JWT/组织校验已在 Nest；P0 用 API 代传，预签名留扩展。
- **导出 PDF/Excel 也归档进桶**：拒绝。与发团运营表、往来账确认单一致，导出即时生成；桶只存原件类附件。
- **确认前候选项只放浏览器**：拒绝。价格/班期须服务端会话（Product Import Session）为真相。

## Consequences

- 落地顺序：先竖切 FileStore + StoredObject（上传/按 id 下载可测），再产品导入解析；解析为同步（代传后同请求读对象），西部中旅总表用 ExcelJS 专用适配器。
- P1 单产品资料用纯库生成 PDF + ExcelJS 总表；Word 为 P1.5；不上无头浏览器打 PDF。
- 更新 `xiaotuanbao-infrastructure.md` 与部署环境变量说明；`UPLOAD_DIR` 视为遗留，随 FileStore 落地淘汰。
- 领域用语：Product Import Session 见 `CONTEXT.md`；StoredObject / FileStore 为基建名，不进 glossary。
