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

**Supplier Management Access**:
供应商管理（`/supplier` 及其详情子路由）仅企业管理员与计调 Role 可访问与编辑。财务 Role 不进入供应商名录；财务在应付、流水中引用 Supplier 档案，但不维护目录 CRUD。
_Avoid_: 财务维护供应商名录, 详情页单独 Menu Key

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
与 Organization 有业务往来的其他旅行社或同业客户。后台菜单、表单抽屉标题、名称字段等名录 CRUD 界面统一使用 **合作伙伴**（如「合作伙伴名称」「创建合作伙伴」），不用「同行」。在 **客源单** 等业务场景中，UI 可称 **客户** 指代所选 Partner（如「发客客户」「客户数量」），与名录管理用语并存。
_Avoid_: 同业, 客户/同行, agent, 同行名称, 编辑同行, 名录 CRUD 界面用「客户」代替「合作伙伴」

**Partner Kind（合作方向）**:
Partner 在业务往来中的方向角色：仅作客户方（发客/客源）、仅作承接方（拼出承接）、或双向合作。存为 `partnerKind`；产品 UI label **合作方向**。与 Partner Type 正交，共同构成 Partner 的双维分类。合作伙伴列表页展示 **统计卡**：在 **启用** 状态下按 `partnerKind` 互斥计数（总数、客户方、承接方、双向合作）。
_Avoid_: 业务身份, 合作类型, 与 Partner Type 混为一列, 统计卡含已归档或停用

**Partner Type（合作伙伴类型）**:
Partner 作为旅行社主体的类型分类，如组团社、地接社、渠道商、综合旅行社、其他。存为 `partnerType`；产品 UI label **合作伙伴类型**（列表/表单）。与 Partner Kind 正交。Partner Epic 1 仅交付名录 CRUD；拼出/客源等业务选择器的过滤规则在对应业务 Epic 再定。
_Avoid_: 同行类型, 与 Partner Kind 共用同一枚举, wholesaler 作 UI label「批发商」, Epic 1 预埋拼出筛选

**Partner Contact Role（联系人角色）**:
Partner 主联系人的职务，如老板、计调、财务、销售、客服、其他。可选字段，仅 Partner 目录表单使用；Supplier 无对应字段。
_Avoid_: 与 Employee Role 混淆, 创建时强制填写

**Partner Directory Form（合作伙伴目录表单）**:
Partner 创建/编辑/详情只读共用的 **三段** 结构：基础信息（含名称、合作伙伴类型、合作方向、状态）、联系人信息（含联系人角色）、结算信息（结算方式、账期规则、结算说明，整段可选）。**不含** Supplier 的「更多财务信息」与独立「备注」段；Partner 无发票、银行、参考报价、业务备注字段。创建时 **合作伙伴名称、合作方向、合作伙伴类型** 三者必填；联系人、结算字段均可选。列表交互与 Supplier 一致：名称链至详情页，操作列「编辑」开列表抽屉，详情顶栏「编辑」开详情抽屉；**不**采用单抽屉 view/edit 双模式。详情页 Tab：**基本信息**（实装）+ **往来账款**、**合作团单**（占位，与 Supplier 一致）。
_Avoid_: 与 Supplier 共用五段表单, 为 Partner 增加 Supplier Financial Profile, 创建时 partnerType 可选, 单抽屉查看/编辑模式, Epic 1 实装往来账款或合作团单 Tab

**Supplier（供应商）**:
为发团提供资源的服务商，如酒店、车队、餐厅、景区等。供应商档案是 Organization 内的自营资源名录，主路径是在发团执行安排中选 supplier，而非独立 ERP。
_Avoid_: 资源商, vendor

**Directory Profile Status（目录档案状态）**:
Partner 与 Supplier 目录记录的生命周期状态：启用、停用、已归档。适用于目录实体，不适用于 Employee（Employee Status 仅启用/停用）或 Organization 账号。
_Avoid_: 复用 Employee Status, 用 deletedAt 表达归档

**Directory Archive（目录归档）**:
将 Partner 或 Supplier 从默认目录列表中移除，同时保留行以供历史追溯。归档后状态为已归档；记录仍可从历史发团、资源、财务上下文中链接，但不得出现在默认目录列表或新业务的选择源中。产品 UI 可将此操作标为 **删除**，当用户意图是从日常名录工作中不再看到该档案时。默认目录列表不展示已归档行；用户可通过「显示已归档」查看并 **恢复**。
_Avoid_: 归档当作数据库硬删, 归档与停用混为一谈, 归档后不可恢复

**Directory Restore（目录恢复）**:
将已归档的 Partner 或 Supplier 恢复为非归档状态，使其重新出现在默认目录列表。恢复后状态通常为启用，是否改回停用由用户在编辑抽屉中另行调整。
_Avoid_: 恢复当作新建, 恢复后自动硬删历史引用

**Supplier Disabled（供应商停用）**:
供应商目录状态为停用。档案仍在非归档的目录管理视图中可见，但不得在新业务（如资源安排、应付对手方选择）中被选用。
_Avoid_: 停用当作归档, 停用后从列表隐藏

**Partner Disabled（合作伙伴停用）**:
Partner 目录状态为停用。档案仍在非归档的目录管理视图中可见，但不得在新业务（如客源单选客户、行程段拼出选承接方）中被选用。Partner Epic 1 仅实现名录 CRUD 与 lifecycle API，**不在**业务选择器中 enforce；enforcement 在客源/行程段 Epic 落地。
_Avoid_: 停用当作归档, Epic 1 在选择器中拦截停用或归档 Partner

**Directory Name Uniqueness（目录名称唯一）**:
同一 Organization 内，Partner 与 Supplier 各自按 **名称** 唯一；不得存在两条同名且均未归档的目录记录。保存重名时拒绝并提示用户修改名称或在名称中加入可区分后缀（如门店、区域）。
_Avoid_: 允许同名靠备注区分, 全局跨 Organization 唯一

**Directory Catalog（目录层共用）**:
Partner 与 Supplier 在名录层的共用概念与展示规则，包括三态生命周期、归档/恢复、名称唯一、结算字段 enum 与 UI label（账期规则、结算说明）。表单段数与字段集 **不必相同**：Supplier 为五段且含更多财务信息与备注；Partner 为三段且无发票/银行。Epic 先交付 Supplier，Partner 后续 Epic 复用目录层生命周期与结算 catalog，而非两套独立 CRUD。实现 Partner 时 **inline** 从 Supplier 抽出共用 catalog（如 `features/directory/`），不单独前置 refactor sprint。
_Avoid_: Partner 与 Supplier 各写一套归档规则, 目录层与 Employee 生命周期混用, 强行统一五段表单, Partner 全量 copy 后再做 directory 抽取

**Directory Payment Term Rule（账期规则）**:
Partner 与 Supplier 目录层的结算节奏，如每团结、周结、半月结、月结、按约定。Supplier 存为 settlementCycle，Partner 存为 paymentTermRule，产品 UI 统一 label **账期规则**。
_Avoid_: 结算周期, 账期, payment term 混用在目录表单

**Directory Settlement Notes（结算说明）**:
Partner 与 Supplier 目录层的自由文本，说明结算例外或对账补充（如「出团后 7 个工作日结」）。产品 UI 统一 label **结算说明**。
_Avoid_: 结算备注, 账期说明

**Supplier Reference Quote Notes（供应商参考报价说明）**:
Supplier 目录层的自由文本，描述典型报价方式（如人均价、含餐、淡旺季）。仅供计调参考，不是结构化价格事实，不驱动资源金额或应付。
_Avoid_: 默认单价, 参考价作系统计价

**Supplier Category（供应商类别）**:
Supplier 名录中对服务商类型的分类，用于列表展示与筛选。固定枚举：餐厅、酒店、车队、导游、景区、购物店、演出、保险、票务、其他。与执行安排中 **资源类型**（单次资源行的 kind）是不同概念：类别描述 supplier 主体是谁，资源类型描述一次安排用了什么资源。
_Avoid_: 与 resourceKind 共用同一枚举, 类别当作资源类型

**Supplier Business Notes（供应商备注）**:
Supplier 目录层关于合作事实的自由文本（如接待上限、是否支持加单）。表单与只读区 section 标题为 **备注**，非「业务备注」。
_Avoid_: 业务备注, 用备注代替结算说明

**Supplier Financial Profile（供应商更多财务信息）**:
Supplier 目录层可选区块：是否可开票、发票类型、税率、收款银行账户。在创建/编辑表单中 **默认折叠**；收款账户可再内层折叠。轻量创建时不强制填写。
_Avoid_: 创建时强制填银行账号, 与结算信息混为一段

**Finance Transaction（财务流水）**:
Organization 内的资金进出记录。
_Avoid_: 流水账, 记账

**Verification（核销）**:
_Avoid_: 结算, 对账
