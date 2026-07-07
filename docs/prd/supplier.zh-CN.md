# PRD：供应商管理（Epic 1）

**状态**：已定案（Grilling 2026-07-07）  
**Menu Key**：`/supplier`  
**域词汇**：见根目录 [CONTEXT.md](../../CONTEXT.md)  
**参考规格**：旅易云 `product/docs/prd-supplier-detail-page.zh-CN.md`（字段与五段表单结构对齐；路由与生命周期以小团宝本文为准）

---

## 1. 背景与目标

地接社计调需在「供应商管理」中维护自营资源供应商档案，并快速进入详情查看完整信息。供应商是 Organization 内的 **资源名录/通讯录**；主路径是在发团执行安排中选择 supplier，而非独立 ERP。

**Epic 1 目标**：

1. 交付供应商 **一览 / 创建 / 列表编辑抽屉 / 详情** 全套能力
2. 点击 **供应商名称** 进入独立详情页
3. 创建 / 列表编辑 / 详情编辑 **共用** 五段表单组件
4. 目录层结算字段 UI label 与后续 Partner 对齐：**账期规则**、**结算说明**
5. 代码结构上抽取 **目录共用层**（枚举、catalog、归档逻辑、表单 Section），供 Partner Epic 复用

**Epic 1 非目标**：

| 非目标 | 说明 |
| ------ | ---- |
| 往来账款 Tab 真实业务 | 详情 Tab 仅占位 |
| 合作团单 Tab 真实业务 | 同上 |
| 列表累计支出 / 待付 | 未立项 |
| 执行安排内嵌「快捷创建供应商」 | 依赖发团/执行安排 Epic |
| 停用 supplier 在选择器中的 enforcement | 规则见 CONTEXT；选择器在执行安排 Epic 落地 |
| Partner 功能 | 下一 Epic；共用目录层即可 |

---

## 2. 用户故事

1. 作为计调，我希望点击供应商名称进入详情，以便查看完整档案。
2. 作为计调，我希望在列表操作列「编辑」快速改字段，不必每次进详情。
3. 作为计调，我希望创建与编辑表单分五段（基础 / 联系 / 结算 / 更多财务 / 备注），与详情只读展示一致。
4. 作为计调，我希望「更多财务信息」默认收起，轻量创建时不被淹没。
5. 作为计调，我希望列表默认按 **更新时间倒序**，新建或编辑的供应商排在最上。
6. 作为计调，我希望误删（归档）的供应商可以恢复。
7. 作为企业管理员，我希望与计调一样维护供应商名录。

---

## 3. 权限

| Role | 访问 |
| ---- | ---- |
| 企业管理员 | 可访问、可编辑 `/supplier` 及详情子路由 |
| 计调 | 同上 |
| 财务 | **不可** 访问供应商管理菜单与 API |

后端所有供应商接口须 `@RequireMenu('/supplier')`；详情子路由不单独设 Menu Key。

---

## 4. 路由与导航

| 路径 | 说明 |
| ---- | ---- |
| `/supplier` | 一览 + 创建抽屉 + 列表编辑抽屉 |
| `/supplier/$supplierId` | 详情页（Tab 壳） |

**双入口**：

- **名称列 Link** → 详情页
- **操作列「编辑」** → 列表页编辑抽屉
- **详情顶栏「编辑」** → 详情页编辑抽屉

列表页主按钮：**创建供应商**；抽屉底部提交按钮：**保存**（非「创建供应商」）。

---

## 5. 生命周期

采用 **目录档案三态**（≠ Employee 启用/停用）：

| 状态 | API `status` | 默认列表 | 说明 |
| ---- | ------------ | -------- | ---- |
| 启用 | `active` | 可见 | 正常维护；Epic 1 不在选择器中 enforce |
| 停用 | `disabled` | 可见 | 在编辑抽屉改状态；Epic 1 不在选择器中 enforce |
| 已归档 | `archived` | **不可见** | UI「删除」= 归档；禁止硬删 |

**归档与恢复**：

- 默认列表 **不展示** 已归档行
- 筛选区提供 **「显示已归档」** 开关；开启后展示已归档行，操作列显示 **恢复**
- **恢复** 后状态通常为 `active`；若需停用，用户在编辑抽屉调整
- 列表操作列：**编辑** + **删除**（归档）；启停 **仅** 在编辑抽屉

**名称唯一**：同一 Organization 内 supplier `name` 唯一（含已归档行）。保存重名返回 409；若需新建同名供应商，须先恢复或处理已归档记录。

---

## 6. 详情页 Tab

| Tab | Epic 1 |
| --- | ------ |
| 基本信息 | 只读五段字段 |
| 往来账款 | 占位：「功能建设中，暂不可用」 |
| 合作团单 | 同上 |

---

## 7. 表单结构（五段）

```
基础信息
联系信息
结算信息          ← 可选
更多财务信息      ← 默认折叠
备注
```

创建时仅强制：**供应商名称** + **类别**（状态默认 **启用**）。

### 7.1 基础信息

| 字段 | API 字段 | 必填 | 说明 |
| ---- | -------- | ---- | ---- |
| 供应商名称 | `name` | 是 | 同 org 唯一 |
| 供应商类别 | `category` | 是 | §8.1 |
| 状态 | `status` | 是 | 启用 / 停用（编辑时；创建默认启用） |

### 7.2 联系信息

| 字段 | API 字段 | 必填 |
| ---- | -------- | ---- |
| 主联系人 | `contactName` | 否 |
| 联系方式 | `contactPhone` | 否 |

### 7.3 结算信息（可选）

| 字段 | API 字段 | UI label |
| ---- | -------- | -------- |
| 结算方式 | `settlementMethod` | 结算方式 |
| 账期规则 | `settlementCycle` | **账期规则** |
| 结算说明 | `settlementNotes` | **结算说明** |
| 参考报价说明 | `referenceQuoteNotes` | 参考报价说明 |

### 7.4 更多财务信息（默认折叠）

外层 Collapse，标题「更多财务信息」，**默认收起**。

| 字段 | API 字段 | 说明 |
| ---- | -------- | ---- |
| 是否可开票 | `invoiceAvailable` | `yes` / `no` |
| 发票类型 | `invoiceType` | §8.3；`invoiceAvailable=no` 时禁用并清空 |
| 税率 | `taxRate` | 文本如 `3%`；同上联动 |

内层 Collapse「收款账户信息」，**默认收起**：

| 字段 | API 字段 |
| ---- | -------- |
| 开户名称 | `accountName` |
| 开户行 | `bankName` |
| 银行账号 | `bankAccount` |

### 7.5 备注

| 字段 | API 字段 | section 标题 |
| ---- | -------- | ------------ |
| 备注 | `businessNotes` | **备注** |

占位示例：「例如：最大接待 200 人，支持临时加单……」

---

## 8. 枚举与 catalog

枚举定义放 `packages/shared`；展示 label 放前端 catalog（与 Partner 共用目录层 catalog 为宜）。

### 8.1 供应商类别 `category`

| key | label |
| --- | ----- |
| `restaurant` | 餐厅 |
| `hotel` | 酒店 |
| `transport` | 车队 |
| `guide` | 导游 |
| `scenic` | 景区 |
| `shop` | 购物店 |
| `entertainment` | 演出 |
| `insurance` | 保险 |
| `ticket` | 票务 |
| `other` | 其他 |

与执行安排 **资源类型**（resourceKind）解耦；见 CONTEXT **Supplier Category**。

### 8.2 目录层结算（Partner / Supplier 共用）

**目录档案状态** `status`：`active` 启用、`disabled` 停用、`archived` 已归档

**结算方式** `settlementMethod`：`cash` 现结、`prepay` 预付、`postpay` 挂账后结

**账期规则** `settlementCycle`：`per_group` 每团结、`weekly` 周结、`semi_monthly` 半月结、`monthly` 月结、`as_agreed` 按约定

### 8.3 发票

- `invoiceAvailable`：`yes` / `no`
- `invoiceType`：`normal` 普票、`special` 专票、`unsupported` 不支持

---

## 9. 一览列表

### 9.1 列

供应商名称（Link）｜类别｜主联系人｜联系方式｜结算方式｜账期规则｜状态｜操作

- 结算方式 / 账期规则：catalog 短 label；null → `—`
- **不展示**：参考报价说明、结算说明、发票、银行、备注等
- 操作列：**编辑**、**删除**（归档）；已归档视图下为 **恢复**

### 9.2 筛选

| 筛选项 | 说明 |
| ------ | ---- |
| 关键词 | 匹配名称、主联系人、联系方式 |
| 类别 | 下拉，可选 |
| 状态 | 启用 / 停用（不含已归档） |
| 显示已归档 | 开关；开启后列表含 `archived` 行 |

### 9.3 排序与分页

- **默认排序**：`updatedAt DESC, name ASC`
- **分页**：与员工列表一致（默认每页 10 条，可改 pageSize，展示总数）

---

## 10. API

基础路径 `/api`；所有接口需 JWT + Menu Permission。

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/suppliers` | 列表；query：`search`, `category`, `status`, `includeArchived`, `page`, `pageSize`, `sortBy` |
| POST | `/suppliers` | 创建 |
| GET | `/suppliers/:id` | 详情 |
| PATCH | `/suppliers/:id` | 更新 |
| POST | `/suppliers/:id/archive` | 归档（删除） |
| POST | `/suppliers/:id/restore` | 恢复 |

**错误**：

- `409`：同 Organization 内名称重复
- `403`：无 `/supplier` 权限
- `404`：supplier 不存在或不属于当前 Organization

**租户隔离**：`organizationId` 从 JWT 解析，不接受客户端传入。

### 10.1 响应字段（摘要）

与表单字段一致；列表项可返回摘要字段，详情返回全部字段。

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | string | cuid |
| `name` | string | |
| `category` | enum | |
| `status` | enum | active / disabled / archived |
| `contactName` | string? | |
| `contactPhone` | string? | |
| `settlementMethod` | enum? | |
| `settlementCycle` | enum? | |
| `settlementNotes` | string? | |
| `referenceQuoteNotes` | string? | |
| `invoiceAvailable` | enum? | |
| `invoiceType` | enum? | |
| `taxRate` | string? | |
| `accountName` | string? | |
| `bankName` | string? | |
| `bankAccount` | string? | |
| `businessNotes` | string? | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

---

## 11. 数据模型（Prisma 要点）

表名建议 `suppliers`；须含：

- `organizationId`（多租户隔离）
- `name` + `organizationId` **唯一**
- `status` check：`active` | `disabled` | `archived`
- `category` 及结算、发票字段 check 与 §8 一致
- `createdAt`, `updatedAt`；**不用** `deletedAt` 表达归档（归档 = `status: archived`）

---

## 12. 前端结构（建议）

```txt
apps/web/src/features/supplier/
  components/
    SupplierProfileSections.tsx    # 五段表单（创建/编辑共用）
    SupplierReadonlySections.tsx   # 详情只读
    SupplierComingSoonPanel.tsx    # Tab 占位
  pages/
    SuppliersPage.tsx
    SupplierDetailPage.tsx
apps/web/src/services/supplier.service.ts
packages/shared/src/enums/         # 目录共用枚举（Partner 可复用）
```

列表 UI 对齐现有 **员工管理** 模式（Ant Design Table + Drawer + TanStack Query）。

---

## 13. 验收清单

- [ ] 企业管理员、计调可访问；财务不可见菜单且 API 403
- [ ] 列表列、筛选、排序、分页符合 §9
- [ ] 创建/列表编辑/详情编辑抽屉均为五段结构
- [ ] 创建仅强制名称 + 类别；抽屉提交按钮为「保存」
- [ ] 结算信息含结算方式、账期规则、结算说明、参考报价说明；列头为「账期规则」
- [ ] 更多财务信息默认收起；开票三字段平铺；收款账户内层折叠
- [ ] `invoiceAvailable=no` 时发票类型、税率禁用并清空
- [ ] 详情只读与编辑抽屉字段一致；三 Tab，后两 Tab 占位
- [ ] 名称 Link 进详情；双入口编辑可用
- [ ] 删除 = 归档；默认列表不展示已归档；「显示已归档」+ 恢复可用
- [ ] 启停仅在编辑抽屉；列表操作列为编辑 + 删除
- [ ] 同 org 重名返回 409
- [ ] 目录共用枚举/catalog 可被 Partner Epic 复用（结构就绪即可）
- [ ] API 与 UI 测试覆盖核心路径

---

## 14. 与旅易云差异摘要

| 项 | 旅易云 | 小团宝 |
| -- | ------ | ------ |
| 列表路由 | `/suppliers` | `/supplier` |
| 详情路由 | `/suppliers/:supplierId` | `/supplier/$supplierId` |
| `/suppliers/new` 重定向 | 有 | Epic 1 不做（可选后续） |
| 技术栈 | Hono + Drizzle | NestJS + Prisma |
| 列表组件 | ProductDataTable | Ant Design Table |

字段、五段表单、枚举、Tab 占位、排序与目录 label 与旅易云 PRD 对齐。
