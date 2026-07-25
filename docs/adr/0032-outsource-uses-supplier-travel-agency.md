---
status: accepted
---

# 拼出资源改挂供应商；供应商类别增加旅行社（outsource）

拼出资源行原先关联 Partner（承接方），供应商类别刻意排除 `outsource`（ADR-0005）。业务上拼出承接方与酒店/用车等一样应按供应商名录维护与筛选，因此：

1. **供应商类别**允许 `outsource`；供应商 UI label 为 **旅行社**，资源种类 UI 仍为 **拼出**（同一存值、两侧 label 分流）。
2. **写路径**：全部资源种类（含拼出）关联 Supplier，并校验 `resourceKind ∈ supplier.categories`；拼出表单统一称「供应商」，不再出现「承接方」。
3. **读路径**：历史 Partner 承接拼出行仍按已存 `counterpartyType` 展示与生成应付；合作伙伴「合作团单·拼出」分段仅覆盖该类存量行；新拼出行出现在供应商「服务团单」。

## Considered Options

- **新增独立枚举值 `travel_agency`**：拒绝。与 ADR-0005「类别集合包含资源种类」冲突，需额外映射表，两侧枚举再漂移。
- **供应商类别仍排除 outsource、仅 UI 改称供应商但继续选 Partner**：拒绝。无法按「旅行社」类别筛选供应商名录。
- **强制迁移历史 Partner 拼出行**：拒绝。无可靠 Partner→Supplier 映射；读路径兼容即可。

## Consequences

- `SUPPLIER_ALLOWED_RESOURCE_KINDS` 含全部 `ResourceKind`；`normalizeSupplierCategories` 接受 outsource。
- 供应商服务团单不再排除拼出资源行。
- ADR-0005 中「拼出不得写入供应商类别」由本 ADR 取代；CONTEXT 同步。
