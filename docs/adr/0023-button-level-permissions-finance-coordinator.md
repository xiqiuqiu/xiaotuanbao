---
status: accepted（supersedes ADR-0016）
---

# 计调与财务：从菜单级提升到按钮级（操作级）权限

初期为省成本，ADR-0016 把计调与财务的业务菜单临时对齐为同一集合、开菜单即可写。现决定收回该过渡态，将权限从纯菜单级提升到按钮级，落实 CONTEXT 中计调/财务的长期职责边界，同时保持 ADR-0001「全局固定 Preset Role、不按 Organization 配置」不变。

## 决定

采用**目标型（targeted）**而非全量对称矩阵：因为计调↔财务在「发团业务编辑」这一类动作上总是同进同出（计调全可、财务全否），无需为每个业务对象各建一把 write 锁。

**建模**：复用现有 `Permission` 表，除 menuKey 外新增 action key；`RolePermission` 映射仍全局固定、seed 写死；复用 `MenuPermissionGuard`，write 接口用 `@RequireMenu('departure:write')` 等直接校验。`/auth/me` 在 `menuKeys`（菜单/路由过滤，语义不变）之外新增 `actionKeys`（仅供前端按钮 gating），避免 action key 污染菜单过滤。

**新增 action key（3 本）**：`departure:write`、`partner:write`、`supplier:write`，均为 企业管理员+计调=有、财务=无。

**菜单可见性**：计调 = `/`、`/departure`、`/partner`、`/supplier`（隐藏 `/finance/*` 与 `/system/*`）；财务 = 同上 + `/finance/*` 四菜单（隐藏 `/system/*`）。

**接口归属**：
- `departure:write`：`departure` 的 create/copy/update/transition/close/unarchive；`source-order`/`segment`/`segment-resource`/`route-template` 的 create/update/delete；`voidResourcePayable`（资源应付作废＝财务未介入时的纠错，与「关闭节点」＝财务/已介入互补）。
- 据此**保持素 `/departure`（计调与财务都可）**：`generate-receivables`（发团级、客源单级）、`generate-payable(s)`、发团内财务读 facade。生成不进 `departure:write`，否则财务将无法生成。
- `partner:write` / `supplier:write`：各目录 create/update/archive/restore。
- `/finance/*`：不变。计调不持有这四个 menuKey，登记流水、核销/撤销、关闭节点、调整约定金额因此自动不可，无需额外 action key。

**前端**：客源/执行的编辑字段与删除按 `actionKeys.includes('departure:write')`；**生成应收/应付按钮按是否持有 `/departure` 显示**（财务只读客源仍可生成）。发团详情 Tab：收支流水/核销记录 Tab 按 `/finance/*` 驱动显示（计调自动隐藏）；应收/应付 Tab 计调可见（可生成，写按钮受 `canMutateFinance` 控制）。partner/supplier 详情页按对应 write action 决定只读。

## 取舍与被否方案

- **全量对称矩阵**：每个业务对象各一把 write 锁。被否：计调↔财务在这些动作上完全相关，粒度过细无收益；action key 可加，将来出现第三种角色再拆。
- **按 role 名硬编码能力**：最省但违反 CONTEXT「不代码特判」、role 硬编码难扩展。
- **可按 Organization 配置的按钮权限**：与 ADR-0001 及 Preset Role 固定映射冲突、成本最高，本版不做。

## 后果

- 反转 ADR-0016 的「财务=计调、开菜单即可写」，需 `PRESET_ROLE_MENU_KEYS`、seed 与 RolePermission 双向同步（多删少补）。
- 反转 CONTEXT「第一版不做操作级权限」；`Menu Permission`、`Supplier Management Access`、`财务`、`计调` 词条同步更新。
- 生成应收/应付刻意留在 `/departure`：财务在只读客源 Tab 下仍能看到并触发生成，这是符合文档矩阵的有意行为，非缺陷。
