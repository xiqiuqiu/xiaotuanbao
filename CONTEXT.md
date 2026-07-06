# 小团宝

面向中小地接旅行社的 B 端 SaaS 管理系统，用于团单、行程、资源、财务、同行/客户、供应商及组织权限等业务的日常运营。

## Language

**Organization**:
一家使用小团宝系统的旅行社，是多租户 SaaS 中的租户单位。所有业务数据按 Organization 隔离。
_Avoid_: 租户, tenant, 公司, 账户

**SaaS**:
小团宝以多租户模式运营，多家 Organization 共用同一套部署，通过 organizationId 实现数据隔离。
_Avoid_: 私有化, 独立部署

**User**:
一家 Organization 内的员工账号，用于登录和操作后台。一个 User 只属于一家 Organization，不存在跨组织任职。
_Avoid_: 账户, 成员, 账号

**Employee**:
与 User 同义，指 Organization 内的在职员工。
_Avoid_: 用户（易与系统登录用户混淆时）

**Employee Status**:
员工账号处于启用或停用状态。停用的 Employee 不可登录，状态可恢复；与彻底删除（`deletedAt`）不同。第一版 UI 仅提供启用/停用，不提供删除。
_Avoid_: 软删除作停用, 删除代替停用

**Employee Remark**:
Employee 的内部说明文字，可选，仅用于创建/编辑表单，不在员工列表展示。
_Avoid_: 备注作公开信息, 对外描述

**Last Login**:
Employee 最近一次成功登录的时间，在员工列表中展示为「最近活跃」；从未登录则为空。
_Avoid_: 最近活跃作在线状态, 实时在线

**Platform Admin**:
平台运营方的超级管理员，可跨 Organization 管理租户（开户、停用、查看等）。与 Organization 内的 User 是不同身份，通过 User 表的 isPlatformAdmin 标志位识别，共用同一套登录体系。第一版不实现 Platform Admin 功能与平台管理台；Organization 后台的 Menu Permission 体系与之分离，Platform Admin 账号第一版不使用 Organization 后台。
_Avoid_: 超管, 系统管理员, super admin

**Organization Onboarding**:
新 Organization 由 Platform Admin 创建，并生成邀请链接发给客户；客户通过邀请链接设置密码后激活 Organization，并绑定企业管理员 Role。
_Avoid_: 自助注册, 开放注册

## Roles

**Role Assignment**:
一个 User 在同一 Organization 内可绑定一个或多个 Role。其有效 Menu Permission 为所有已绑定 Role 的权限并集。第一版员工管理界面为单选 Role，保存时全量替换；底层 UserRole 仍支持多 Role，后续可开放多选。
_Avoid_: 单角色, 主角色

**Role Catalog**:
Role、Permission 及其映射为全平台共享的定义，不按 Organization 隔离。User 通过 UserRole 绑定 Role；Menu Permission 在该 User 所属 Organization 的后台内生效。
_Avoid_: 租户级角色表, 每组织复制角色

**企业管理员**:
Organization 的拥有者或最高管理者，拥有全部 Menu Permission。实现上通过 seed 为企业管理员 Role 绑定所有 Permission 行，权限解析无特殊分支。
_Avoid_: 老板, admin, 总经理, 系统管理员, 代码特判

**财务**:
负责应收、应付、财务流水、核销等财务相关菜单。
_Avoid_: 会计, 出纳

**计调**:
负责发团、合作伙伴、供应商等运营相关菜单。行程管理、资源管理尚未上线，不在第一版 Menu Permission 中。
_Avoid_: 操作, 调度, planner, 行程管理, 资源管理

**Preset Role**:
企业管理员、财务、计调三个 Role 由系统统一定义，每个 Organization 创建时自动 seed。第一版 Role 及其 Menu Permission 映射固定，Organization 内不可新增 Role、不可修改权限映射。
_Avoid_: 自定义角色, 角色模板, 权限配置

**System Management Access**:
组织管理、员工管理、角色权限（`/system/*`）仅企业管理员 Role 拥有。财务、计调不可访问系统管理菜单及其后端接口。
_Avoid_: 全员系统设置, HR 角色

## Permissions

**Menu Permission**:
权限控制到菜单级别，决定 User 能否看到并访问某个菜单模块。第一版不做操作级（增删改查）或数据级（只看自己的数据）权限。
_Avoid_: 功能权限, 按钮权限, 数据权限

**Menu Key**:
标识一条 Menu Permission 的稳定键，与前端路由路径一致（如 `/finance/receivable`）。Permission 只对应可访问的叶子路由；分组父菜单（如 `finance`、`system`）不单独存 Permission，当前 User 任一路由子项可见时父菜单自动显示。
_Avoid_: permission code, 菜单 id

**Menu Permission Resolution**:
User 的有效 Menu Permission 由后端根据其所绑 Role 的权限并集计算，经登录与 `/auth/me` 接口以 `menuKeys` 返回（两者共用同一组装逻辑）。前端仅据此过滤菜单与路由，不维护独立的 code 映射或权限规则。页面刷新或 token 恢复时通过 `/auth/me` 重新拉取。
_Avoid_: 前端硬编码权限, 前端 code 表, 仅登录返回权限

**Menu Permission Enforcement**:
Menu Permission 同时约束菜单可见性与后端访问，不能仅靠前端隐藏菜单。第一版对系统管理类 Menu Key 强制后端校验；业务类 Menu Key 随各业务模块落地时补齐。
_Avoid_: 仅前端校验

## Core Entities

**Departure（发团）**:
一次具体的出团活动，是系统核心业务对象。包含发团概览、客源单、执行安排、应收管理四个子模块（Tab）。计调通过发团管理进行日常操作。
_Avoid_: 团单, tour, 团期, 团单管理

**Departure Overview（发团概览）**:
发团的基本信息：线路名称、线路类型、目的地、出发/结束日期、预计成人/儿童人数、负责人、状态等。
_Avoid_: 团期详情, 基本信息

**Source Order（客源单）**:
挂在一个发团下的客户订单，记录该团的客源信息和收客情况。
_Avoid_: 订单, 收客单, 报名单

**Execution Arrangement（执行安排）**:
发团的行程与资源安排，包括每日行程、酒店、车辆、餐饮、门票等资源明细。
_Avoid_: 行程, 资源配置, itinerary

**Departure Receivable（发团应收）**:
某个发团产生的应收款项，在发团详情内管理，与全局财务流水关联。
_Avoid_: 应收, 团款

**Partner（合作伙伴）**:
与 Organization 有业务往来的其他旅行社或同业客户。后台菜单称为「合作伙伴」，Menu Key 为 `/partner`。
_Avoid_: 客户, 同业, 客户/同行, agent

**Supplier（供应商）**:
为发团提供资源的服务商，如酒店、车队、餐厅、景区等。
_Avoid_: 资源商, vendor

**Finance Transaction（财务流水）**:
Organization 内的资金进出记录。
_Avoid_: 流水账, 记账

**Verification（核销）**:
_Avoid_: 结算, 对账
