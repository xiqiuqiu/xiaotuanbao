---
status: accepted（细化 ADR-0023）
---

# 参考/查找类接口按所返回实体的菜单单键守卫

ADR-0023 定了写接口的权限归属，但对「参考/查找类接口」（仅返回 id→名称、用于渲染筛选器与标签的 `finance/departure-options`、`partner-options`、`supplier-options`、`source-order-options`）留松，早期以命令式 `assertFinanceAccess` 只放行持有 `/finance/*` 的角色。结果计调在「合作伙伴/供应商 → 往来账款」Tab 拉 `departure-options` 显示发团名时被 403。现确立房规：**参考类接口按其所返回实体类型的业务菜单单键声明式守卫**（departure/source-order→`@RequireMenu('/departure')`、partner→`/partner`、supplier→`/supplier`），语义为「能看见该类实体，就能取它的查找项」。

## 决定

- 参考接口一律声明式挂 `@RequireMenu(<实体菜单 key>)`，**不用** OR、**不用**认证裸放。三个预设角色（企业管理员、财务、计调）都持有 `/departure`、`/partner`、`/supplier`（财务预设继承计调全部业务菜单），故各角色对这些接口可达性零变化，而计调不再 403。
- 声明式使这些路由对权限矩阵 e2e 可见，并由「参考端点→预期 key」硬断言钉死。
- **命令式鉴权仅在所需 key 取决于运行时数据时保留**（如 payment-schedule 的 cancel/reopen/adjustAmount 按节点 direction 选 `/finance/receivable` 或 `/finance/payable`，单键装饰器表达不了）。此类须在后端静态守卫 `imperative-auth-contract.spec.ts` 的 allowlist 带理由登记，防止命令式鉴权重新变成矩阵盲区。
- **发团作用域的财务对象「读」与「写」分离守卫**：收付款节点（应收/应付）必挂发团，其**详情读** `GET /finance/receivables|payables/:id` 按 `/departure` 放行——计调在发团详情/合作伙伴/供应商往来账款列表（业务菜单放行）可见节点行，点节点编号看详情须一致可读，财务预设亦持 `/departure`；而**写/操作**（create/update/confirm/cancel/reopen/adjust）仍守 `/finance/*`，计调不能改账款。这修掉了「列表按业务菜单可见、详情按 `/finance/*` 403」的读侧漂移。

## 取舍与被否方案

- **OR 语义（业务菜单 OR 任一 `/finance/*`）**：需把 `@RequireMenu`／守卫／矩阵扩成多键 OR。被否：预设角色本就都持业务菜单，OR 是冗余；只有出现「持 `/finance/*` 而无业务菜单」的自定义角色才需要，而角色为只读预设、不可自定义（ADR-0001）。真到那天再引入 OR 能力的守卫不迟。
- **仅认证放行（不挂 RBAC key）**：最省，但削弱纵深防御，且矩阵不视其为受控。被否。

## 后果

- 存在一条当前不变量：合作伙伴/供应商「往来账款」Tab 里的 `departure-options` 按所返回实体挂 `/departure`（而非当前屏幕的 `/partner`）。将来若出现「有 `/partner`、无 `/departure`」的角色，往来账款的发团名列会断裂——届时重估口径。
- 收回本仓最后一处「不必要的」命令式鉴权（finance-reference）；连带清理 payment-schedule 的 `voidResourcePayable` 中与 controller `departure:write` 冗余的 `/departure` 命令式校验。
