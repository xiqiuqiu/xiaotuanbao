# PRD：合作伙伴管理（Epic 1）

**状态**：已定案（Grilling 2026-07-07）  
**Menu Key**：`/partner`  
**域词汇**：见根目录 [CONTEXT.md](../../CONTEXT.md)  
**参考规格**：旅易云 Partner 目录（双维分类、统计卡、三段表单）；路由、生命周期、列表交互以小团宝 Supplier Epic 1 为准

---

## Problem Statement

地接社计调需要在「合作伙伴管理」中维护同业旅行社档案（发客客户、拼出承接方），并区分 **合作方向** 与 **合作伙伴类型** 两个正交维度。当前小团宝 `/partner` 仅为占位页，无数据库表、API 或前端实现；Supplier Epic 1 已落地，可作为目录层 CRUD 的参考模板，但 Partner 表单更轻（三段、无发票/银行），且需移植旅易云验证过的双维分类与列表统计卡。

---

## Solution

交付合作伙伴 **一览（含统计卡）/ 创建 / 列表编辑抽屉 / 详情 Tab 壳** 全套名录 CRUD。Partner 与 Supplier 共用目录层 lifecycle（三态、归档/恢复、名称唯一、结算 enum 与 UI label），但 **不共用五段表单**。实现 Partner 时 **inline** 从 Supplier 抽出目录共用 catalog，供双方复用。Epic 1 不实现客源/拼出选择器及其过滤 enforcement。

---

## User Stories

1. 作为计调，我希望在合作伙伴列表顶部看到按合作方向划分的统计卡，以便快速了解客户方、承接方与双向合作的启用档案数量。
2. 作为计调，我希望点击合作伙伴名称进入详情页，以便查看完整档案。
3. 作为计调，我希望在列表操作列「编辑」快速改字段，不必每次进详情。
4. 作为计调，我希望创建与编辑表单分 **三段**（基础 / 联系人 / 结算），与详情只读展示一致。
5. 作为计调，我希望创建时必填 **合作伙伴名称、合作方向、合作伙伴类型**，以便双维分类从建档起就完整。
6. 作为计调，我希望结算信息整段可选，轻量创建时不被财务字段阻碍。
7. 作为计调，我希望列表可按合作方向、合作伙伴类型、状态、关键词筛选，并可切换「显示已归档」。
8. 作为计调，我希望列表默认按 **更新时间倒序**，新建或编辑的合作伙伴排在最上。
9. 作为计调，我希望误删（归档）的合作伙伴可以恢复。
10. 作为计调，我希望名录 CRUD 界面统一使用「合作伙伴」文案，不用「同行」。
11. 作为企业管理员，我希望与计调一样维护合作伙伴名录。
12. 作为财务，我不应看到合作伙伴管理菜单，且调用相关 API 应被拒绝。
13. 作为开发者，我希望 Partner API 与 Supplier API 对称（列表/创建/详情/PATCH/归档/恢复），以便复用测试与实现模式。
14. 作为开发者，我希望目录层结算 enum 与 label（账期规则、结算说明）与 Supplier 共用，避免两套 catalog。
15. 作为开发者，我希望列表 API 返回 **summary** 统计（启用态按 `partnerKind` 互斥计数），供统计卡消费，避免前端全量拉取计数。
16. 作为计调，我希望详情页有三个 Tab：基本信息（实装）、往来账款与合作团单（占位「功能建设中，暂不可用」），与 Supplier 详情一致。
17. 作为计调，我希望在编辑抽屉中调整启用/停用状态，列表操作列仅提供编辑与删除（归档）。
18. 作为计调，我希望保存重名合作伙伴时得到明确错误提示，以便修改名称或处理已归档同名记录。
19. 作为开发者，我希望实现 Partner 时 inline 抽取 directory 共用 catalog，且现有 Supplier 行为与测试保持通过。

---

## Implementation Decisions

### 权限

| Role | 访问 |
| ---- | ---- |
| 企业管理员 | 可访问、可编辑 `/partner` 及详情子路由 |
| 计调 | 同上 |
| 财务 | **不可** 访问合作伙伴管理菜单与 API |

后端所有合作伙伴接口须 `@RequireMenu('/partner')`；详情子路由不单独设 Menu Key。

### 路由与导航

| 路径 | 说明 |
| ---- | ---- |
| `/partner` | 一览 + 统计卡 + 创建抽屉 + 列表编辑抽屉 |
| `/partner/$partnerId` | 详情页（Tab 壳） |

**双入口**（与 Supplier 一致，不采用旅易云单抽屉 view/edit 模式）：

- **名称列 Link** → 详情页
- **操作列「编辑」** → 列表页编辑抽屉
- **详情顶栏「编辑」** → 详情页编辑抽屉

列表页主按钮：**创建合作伙伴**；抽屉标题 **创建合作伙伴** / **编辑合作伙伴**；抽屉底部提交按钮：**保存**。

### 生命周期

采用 **目录档案三态**（见 CONTEXT **Directory Profile Status**）：

| 状态 | API `status` | 默认列表 | 说明 |
| ---- | ------------ | -------- | ---- |
| 启用 | `active` | 可见 | Epic 1 不在业务选择器中 enforce |
| 停用 | `disabled` | 可见 | 在编辑抽屉改状态 |
| 已归档 | `archived` | **不可见** | UI「删除」= 归档；禁止硬删 |

归档与恢复、名称唯一规则与 Supplier Epic 1 相同：`organizationId` + `name` 唯一（含已归档行）；重名 409。

### 双维分类

**合作方向** `partnerKind`（必填）：

| key | UI label |
| --- | -------- |
| `group_agent` | 客户方 |
| `peer` | 承接方 |
| `both` | 双向合作 |

**合作伙伴类型** `partnerType`（必填）：

| key | UI label |
| --- | -------- |
| `group_agency` | 组团社 |
| `local_agency` | 地接社 |
| `wholesaler` | 渠道商 |
| `integrated_agency` | 综合旅行社 |
| `other` | 其他 |

两维正交；列表同时展示并支持独立筛选。Epic 1 **不**实现拼出/客源选择器 filter 模块。

### 表单结构（三段）

```
基础信息
联系人信息
结算信息          ← 整段可选
```

**不含**：Supplier 的「更多财务信息」「备注」、参考报价、发票、银行字段。

#### 基础信息

| 字段 | API 字段 | 必填 | 说明 |
| ---- | -------- | ---- | ---- |
| 合作伙伴名称 | `name` | 是 | 同 org 唯一 |
| 合作伙伴类型 | `partnerType` | 是 | §双维分类 |
| 合作方向 | `partnerKind` | 是 | §双维分类 |
| 状态 | `status` | 是 | 启用 / 停用（编辑时；创建默认启用） |

#### 联系人信息

| 字段 | API 字段 | 必填 |
| ---- | -------- | ---- |
| 主联系人 | `contactName` | 否 |
| 联系人角色 | `contactRole` | 否 |
| 联系方式 | `contactPhone` | 否 |

**联系人角色** `contactRole` 枚举：`owner` 老板、`operator` 计调、`finance` 财务、`sales` 销售、`customer_service` 客服、`other` 其他。

#### 结算信息（可选）

| 字段 | API 字段 | UI label |
| ---- | -------- | -------- |
| 结算方式 | `settlementMethod` | 结算方式 |
| 账期规则 | `paymentTermRule` | **账期规则** |
| 结算说明 | `settlementNotes` | **结算说明** |

`paymentTermRule` 与 Supplier 的 `settlementCycle` **共用同一 enum 值**（`per_group` / `weekly` / `semi_monthly` / `monthly` / `as_agreed`），仅 Partner 字段名不同。

### 详情页 Tab

| Tab | Epic 1 |
| --- | ------ |
| 基本信息 | 三段只读字段 |
| 往来账款 | 占位：「功能建设中，暂不可用」 |
| 合作团单 | 同上 |

### 一览列表

#### 统计卡

列表顶部 **4 张统计卡**，数据来自列表 API 的 `summary`：

| 卡 | 计数规则 |
| -- | -------- |
| 合作伙伴总数 | `status = active` 的全部 Partner |
| 客户方 | `status = active` 且 `partnerKind = group_agent` |
| 承接方 | `status = active` 且 `partnerKind = peer` |
| 双向合作 | `status = active` 且 `partnerKind = both` |

互斥按 `partnerKind`；**不含**停用或已归档。

#### 列

合作伙伴名称（Link）｜合作伙伴类型｜合作方向｜主联系人｜联系方式｜结算方式｜账期规则｜状态｜操作

- 合作方向 / 类型：catalog label；结算 null → `—`
- **不展示**：结算说明、联系人角色等详情字段
- 操作列：**编辑**、**删除**（归档）；已归档视图下为 **恢复**

#### 筛选

| 筛选项 | 说明 |
| ------ | ---- |
| 关键词 | 匹配名称、主联系人、联系方式 |
| 合作方向 | 下拉，可选 |
| 合作伙伴类型 | 下拉，可选 |
| 状态 | 启用 / 停用（不含已归档） |
| 显示已归档 | 开关 |

#### 排序与分页

- **默认排序**：`updatedAt DESC, name ASC`
- **分页**：与 Supplier 列表一致（默认每页 10 条）

### API

基础路径 `/api`；所有接口需 JWT + Menu Permission。

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/partners` | 列表；query：`search`, `partnerKind`, `partnerType`, `status`, `includeArchived`, `page`, `pageSize`, `sortBy` |
| POST | `/partners` | 创建 |
| GET | `/partners/:id` | 详情 |
| PATCH | `/partners/:id` | 更新 |
| POST | `/partners/:id/archive` | 归档 |
| POST | `/partners/:id/restore` | 恢复 |

**列表响应**除 `items`, `total`, `page`, `pageSize` 外，须含 `summary`：

```typescript
{
  total: number      // active count（与「合作伙伴总数」卡一致）
  groupAgent: number
  peer: number
  both: number
}
```

（`summary` 仅统计 `status = active`；`total` 为 active 总数，等于三 kind 之和。）

**错误**：

- `409`：同 Organization 内名称重复
- `403`：无 `/partner` 权限
- `404`：partner 不存在或不属于当前 Organization
- `400`：创建缺少必填字段或非法 enum

**租户隔离**：`organizationId` 从 JWT 解析，不接受客户端传入。

#### 响应字段（摘要）

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `id` | string | cuid |
| `name` | string | |
| `partnerKind` | enum | |
| `partnerType` | enum | |
| `status` | enum | active / disabled / archived |
| `contactName` | string? | |
| `contactRole` | enum? | |
| `contactPhone` | string? | |
| `settlementMethod` | enum? | |
| `paymentTermRule` | enum? | |
| `settlementNotes` | string? | |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### 数据模型（Prisma 要点）

表名 `partners`：

- `organizationId`（多租户）
- `name` + `organizationId` **唯一**
- `partnerKind` not null；`partnerType` not null
- `status`：`active` | `disabled` | `archived`
- `paymentTermRule` 复用 `SettlementCycle` enum（或等价 DB enum）
- `contactRole` 可选 enum
- **无** invoice / bank / businessNotes / referenceQuoteNotes
- `createdAt`, `updatedAt`；归档用 `status`，不用 `deletedAt`

### 目录共用层（inline 抽取）

实现 Partner 时，将 Supplier 与 Partner 共用的目录 catalog（`DirectoryProfileStatus`、结算方式、账期规则、结算说明 label 等）抽到 **directory 共用模块**；Supplier 改为从共用模块 import。Partner 自有 catalog：`partnerKind`、`partnerType`、`contactRole` label。

### 业务 UI 用语（非 Epic 1 实现，但 PRD 记录）

名录 CRUD 用 **合作伙伴**；将来客源单 Tab 选 Partner 时 UI 可称 **客户**（见 CONTEXT）。Epic 1 不实现客源/行程段页面。

### 与旅易云差异摘要

| 项 | 旅易云 | 小团宝 Epic 1 |
| -- | ------ | ------------- |
| 路由 | `/partners` | `/partner` |
| 表单 | 3 段 | 3 段（对齐） |
| 创建必填 | name + partnerKind；type 可选 | **name + partnerKind + partnerType** |
| 列表交互 | 单抽屉 view/edit | Supplier 双入口 |
| 产品文案 | 同行 | **合作伙伴** |
| 拼出 filter | 已实现 | **不做** |
| 财务字段 | Partner 无 | 同左 |
| wholesaler label | 批发商（审查中改渠道商） | **渠道商** |

---

## Testing Decisions

### 什么是好测试

只测 **对外可观察行为**：HTTP 状态码、响应体字段、权限边界、列表筛选与 summary 计数、归档可见性。不断言 service 内部实现或 Prisma 调用次数。

### 主测试接缝（单一最高接缝）

**Partner HTTP E2E**（`/api/partners`），镜像 Supplier E2E 覆盖范围并扩展双维字段：

- 财务角色 GET/POST → 403
- 创建：必填三元组；缺字段 → 400
- 列表：默认排除 archived；`includeArchived=true` 含 archived
- 列表：`partnerKind` / `partnerType` 筛选
- 列表：`summary` 在 mixed fixtures 下计数正确（仅 active，kind 互斥）
- GET by id；跨 org → 404
- PATCH 更新；重名 → 409
- POST archive / restore 与列表可见性联动

**现有 Supplier E2E 在 directory catalog 抽取后须仍全部通过**——共用层 refactor 的回归接缝。

### 次要测试（可选，非 Epic 1 阻塞）

- 前端：`PartnerReadonlySections` 渲染三段字段与 catalog label（参考 Supplier 组件测试）
- 前端：`PartnerDetailPage` Tab 占位文案（参考 `SupplierComingSoonPanel` 测试）

### Prior art

- `apps/api/test/supplier.e2e-spec.ts`
- `apps/web/src/features/supplier/pages/SupplierDetailPage.test.tsx`
- `apps/web/src/features/supplier/components/SupplierReadonlySections.test.tsx`

---

## Out of Scope

| 非目标 | 说明 |
| ------ | ---- |
| 往来账款 Tab 真实业务 | 占位即可 |
| 合作团单 Tab 真实业务 | 同上 |
| 拼出/客源选择器及 filter | 后续 Departure / 客源 Epic |
| 停用/归档在选择器 enforce | 同上 |
| 列表累计支出/待付 | 未立项 |
| 发票、银行、参考报价、业务备注 | Partner 无这些字段 |
| `city` 字段 | 旅易云 schema 已移除，不移植 |
| 快捷创建 Partner（业务页内嵌） | 依赖未上线 Epic |

---

## Further Notes

- Supplier PRD 曾写「Partner 复用五段表单」——Grilling 已 supersede：Partner 为 **三段轻量表单**。
- 权威来源：`CONTEXT.md` + 已落地 Supplier > 旅易云线上行为 > 旧 PRD 字面表述。
- 实现顺序建议：schema + shared enums → API + E2E → inline directory catalog 抽取（Supplier 回归）→ 前端列表/抽屉/详情。

---

## 验收清单

- [ ] 企业管理员、计调可访问；财务不可见菜单且 API 403
- [ ] 统计卡 4 项与 `summary` 一致（仅 active）
- [ ] 列表列、筛选（含 kind/type）、排序、分页符合规格
- [ ] 创建/编辑/详情均为 **三段**；必填 name + partnerKind + partnerType
- [ ] 文案统一「合作伙伴」；`wholesaler` 显示「渠道商」
- [ ] 结算段 label：账期规则、结算说明；Partner 字段 `paymentTermRule`
- [ ] 详情三 Tab，后两 Tab 占位
- [ ] 名称 Link 进详情；双入口编辑可用
- [ ] 删除 = 归档；显示已归档 + 恢复可用
- [ ] 同 org 重名 409
- [ ] directory 共用 catalog 已抽取；Supplier E2E 仍通过
- [ ] Partner E2E 覆盖核心路径
