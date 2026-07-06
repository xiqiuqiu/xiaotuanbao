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

**Platform Admin**:
平台运营方的超级管理员，可跨 Organization 管理租户（开户、停用、查看等）。与 Organization 内的 User 是不同身份，通过 User 表的 isPlatformAdmin 标志位识别，共用同一套登录体系。
_Avoid_: 超管, 系统管理员, super admin

**Organization Onboarding**:
新 Organization 由 Platform Admin 创建，并生成邀请链接发给客户；客户通过邀请链接设置密码后激活 Organization 并成为初始管理员。
_Avoid_: 自助注册, 开放注册

## Roles

**老板**:
Organization 的拥有者或最高管理者，拥有全部菜单权限。
_Avoid_: 管理员, admin, 总经理

**财务**:
负责应收、应付、财务流水、核销等财务相关菜单。
_Avoid_: 会计, 出纳

**计调**:
负责团单、行程、资源、客户/同行、供应商等运营相关菜单。
_Avoid_: 操作, 调度, planner

## Permissions

**Menu Permission**:
权限控制到菜单级别，决定 User 能否看到并访问某个菜单模块。第一版不做操作级（增删改查）或数据级（只看自己的数据）权限。
_Avoid_: 功能权限, 按钮权限, 数据权限

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

**Partner（同行）**:
与 Organization 有业务往来的其他旅行社或同业客户。
_Avoid_: 客户, 同业, agent

**Supplier（供应商）**:
为发团提供资源的服务商，如酒店、车队、餐厅、景区等。
_Avoid_: 资源商, vendor

**Finance Transaction（财务流水）**:
Organization 内的资金进出记录。
_Avoid_: 流水账, 记账

**Verification（核销）**:
_Avoid_: 结算, 对账
