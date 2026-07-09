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

**Organization Business Prefix（组织业务前缀）**:
Organization 创建时必填、仅可设置一次的 2–4 位大写英文字母标识，用于生成发团编号及财务类业务编号。未设置前缀的 Organization 不得创建发团、收付款节点、流水或核销。前缀建议全系统唯一。
_Avoid_: 租户代码, 组织编码, 创建后补设前缀

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
一次具体出团活动的运营容器，是系统核心业务对象。计调在此录入客源、按线路规划行程、在行程段内安排自营资源或拼出，再触发关联的财务事件。**发团**是客户日常口头业务名称；发团是运营聚合根，**不是**财务结算单元——应收挂在客源单，应付挂在行程段或资源，发团头部的毛利与待收待付为跨子单元的汇总视图。
_Avoid_: 团单, tour, 团期, 团单管理, 接团单, Project

**Departure Overview（发团概览）**:
发团的基本信息：线路名称、线路类型、目的地、出发/结束日期、预计成人/儿童人数、负责人、状态等。
_Avoid_: 团期详情, 基本信息

**Departure Progress（出团进度）**:
由出团日期与结束日期自动派生的时间状态：未开始、进行中、已结束。表达这趟团在时间轴上的位置，不驱动财务锁定或只读规则。
_Avoid_: 出团状态, 团期状态, 进行中（作发团业务状态）

**Departure Status（发团状态）**:
发团业务处理阶段：编辑中、待结算、已结清、已关闭。编辑中 → 待结算由 OP 手动切换；已结清在收付款节点全部结清或关闭后由系统判定（可提示 OP 确认）；已关闭为归档只读，由 OP 手动触发。不等于财务单据是否已全部生成。
_Avoid_: 团单状态, 项目状态, 确认发团

**Departure Type（发团类型）**:
发团成团方式的展示标签，如独立团、拼团。仅用于列表筛选与识别；不约束客源单数量，不改变业务规则。独立团即恰好只有一条客源单的发团，模型与拼团相同。
_Avoid_: 团单类型, 单团, 结构性拼团

**Route Template（常用路线）**:
Organization 内常发线路的配置快照，保存行程段结构、默认执行方式、资源配置与参考价格。地接社日常在固定线路上反复收客、配资源、做核算；选路线建团时一次性复制进新发团，之后模板与发团实例脱钩。模板不保存客源、应收应付与流水核销。
_Avoid_: 线路模板, 产品, product, 活引用

**Source Order（客源单）**:
发团内的收入侧结算单元，对应一家合作旅行社输送到地接社的一批客人。记录发客客户、成人/儿童人数与对应团款单价、优惠及收款拆分。不同合作方可在同一发团下各有独立客源单；应收从客源单触发生成，而非从发团统一生成。
_Avoid_: 订单, 收客单, 报名单, 客源记录, 客源批次

**Adult Guest Count（成人人数）**:
客源单上按计价分类的成人数，由用户录入，允许为 0；与儿童人数相加得到总人数。业务上纯儿童团少见，但模型不强制必须有成人。新建客源单默认 0，保存前须使总人数 ≥ 1。
_Avoid_: 大人人数, 成人客人数

**Child Guest Count（儿童人数）**:
客源单上按计价分类的儿童数，由用户录入，允许为 0；与成人人数相加得到总人数。新建客源单默认 0。
_Avoid_: 小孩人数, 儿童客人数

**Total Guest Count（总人数）**:
客源单上的客人合计人数，等于成人人数 + 儿童人数；只读派生，不单独录入，持久化时仍可保存该派生值供列表与汇总使用。约束为总人数 ≥ 1（成人与儿童不可同时为 0）。
_Avoid_: 客人人数（作唯一录入字段时）, 总客人数

**Adult Unit Price（成人团款单价）**:
客源单上每位成人的优惠前团款单价，允许为 0（如免票）。成人人数大于 0 时必填；成人人数为 0 时可不填，计算按 0。
_Avoid_: 成人价, 大人单价

**Child Unit Price（儿童团款单价）**:
客源单上每位儿童的优惠前团款单价，允许为 0（如免票）。儿童人数大于 0 时必填；儿童人数为 0 时可不填，计算按 0。
_Avoid_: 儿童价, 小孩单价

**Gross Receivable（原始应收）**:
客源单优惠前的整单应收基数，等于成人人数 × 成人团款单价 + 儿童人数 × 儿童团款单价；只读派生。产品抽屉在「团款与优惠」区展示为「原始团款金额」；底部预览不再重复该项，仅保留结算金额与我方代收。
_Avoid_: 原始团款单价（作整单汇总时）, 团款总额（与结算金额混淆时）

**Source Order Guest List（客人名单）**:
客源单下的计调备忘名单，记录出行客人姓名等便于现场对接的信息。不是客源单人数、团款或应收的事实来源；名单人数可与客源单总人数不一致，也不提供「同步人数」回写客源单。
_Avoid_: 游客档案（与应收往来对象混淆时）, 名单即人数, 报名单, 同步人数

**Collection Split（收款拆分）**:
客源单上表达「钱由谁收、收多少」的录入方式。合作旅行社可能已代收了部分或全部团款；地接社也可能需直接向游客收取剩余或全部款项。收款拆分决定生成应收时走哪条路径，本身不是财务单据。
_Avoid_: 收款责任, 收款方式（作领域术语时）, 团款组成

**Customer Settlement Receivable（客户补款）**:
应收路径之一：合作旅行社已向游客收取、地接社仍需向该合作方收取的部分。往来对象为发客 Partner。仅当该路径金额大于零时生成对应收付款节点。
_Avoid_: 组团社已收, 客户已收金额（作应收名称）

**Guest Collection Receivable（游客代收）**:
应收路径之一：地接社需直接向游客收取的部分。往来对象为游客档案。仅当该路径金额大于零时生成对应收付款节点。
_Avoid_: 地接代收, 我方代收金额（作应收名称）

**Source Order Partner Settlement（客源单合作方结算）**:
地接社向游客收取全款后，按商业约定仍需向发客合作方支付的款项。第一版不在客源单上自动生成对 Partner 的应付；计调/财务在应付管理中手动录入。后续若业务规则稳定，再考虑从客源单结构化触发。
_Avoid_: 返佣, 佣金应付, 自动生成合作方应付

**Itinerary Segment（行程段）**:
发团内按日期、目的地切分的行程规划单元，例如「喀纳斯段｜7月1日至3日｜3天」。计调通常以「第几天到第几天在某个景点」来规划。行程段是成本侧锚点，其下挂多条资源行；段内可同时存在自营资源与拼出资源。第一版不做到每日行程明细。
_Avoid_: 执行批次, Execution Batch, Day, 每日行程, 自营段, 拼出段

**Segment Resource（行程段资源）**:
挂在行程段下的成本费用行，统一承载自营资源与拼出。计调在段内按 **资源种类** 添加费用行；种类为拼出时关联 Partner（承接方），其他种类关联 Supplier，且该种类须属于该 Supplier 的 **供应商类别** 集合。一段内可有多条、种类可混合；同一 Supplier 可被不同种类的资源行引用（如酒店供应商既挂酒店费又挂餐费）。触发生成应付时以资源行为来源，仅对手方不同。
_Avoid_: 资源安排（作实体名或独立 Tab）, Resource Item, 拼出记录, Segment Outsource, 执行方式, 一家供应商只能对应一种资源行

**Resource Kind（资源种类）**:
一次行程段资源安排所用资源的分类，存为单值。取值与 **供应商类别** 共用同一套枚举（规范名 Resource Kind）：用车、酒店、导游、门票、餐、景区、购物店、演出、保险、拼出、其他。产品 UI label **资源种类**（不用「资源类型」「供应商类别」指代资源行字段）。拼出仅出现在资源行，表示整段或部分服务拼给同行。
_Avoid_: 资源类型, Supplier Category（作资源行字段名）, 车队/餐厅/票务（作与用车/餐/门票并列的另一套 label）, 为资源行与供应商维护两套枚举

**Execution Arrangement（执行安排）**:
发团详情中规划行程段与段内资源（含自营与拼出）的工作区；详情页 Tab 正式称「执行安排」。区内「行程段」指段导航（对应 Itinerary Segment），「资源安排」指资源主表（对应 Segment Resource 列表）——二者为工作区内称谓，不是独立 Tab。
_Avoid_: 行程段/资源安排作独立详情 Tab, 行程, 资源配置, itinerary, 每日工作台

**Payment Schedule（收付款节点）**:
Organization 内的计划应收或计划应付，承载约定金额、到期日、往来对象与来源追溯。从客源单或行程段资源 **显式触发** 生成；保存源事实本身不产生收付款节点。结清状态从核销分配派生，不是发团或客源单的属性。产品 UI 在应付侧称 **应付单**、应收侧称 **应收单**；编号字段展示 `scheduleNo`（ADR-0003 格式）。
_Avoid_: 应收, 应付, 账款, Departure Receivable, 发团应收, 节点编号（作登记抽屉只读 label）

**Payment Schedule Status（收付款节点状态）**:
后端存储的结清态枚举：`pending`（未结清且未逾期）、`overdue`（未结清且已逾期）、`settled`（已结清）、`cancelled`（已关闭）。**不**单独存 `partial`；部分核销后只要未结清金额大于零，状态仍为 `pending` 或 `overdue`。
_Avoid_: 部分收款/部分付款（作存储状态）, 待收款/待付款（作枚举值）

**Payment Schedule Settlement Label（收付款节点结清展示）**:
列表与详情面向财务人员的结清进度文案，由方向 + 已核销金额 + 节点状态 **展示层派生**，不写入数据库。应收侧：待收款、部分收款、已收清；应付侧：待付款、部分付款、已付清；`cancelled` 统一展示已关闭。`overdue` 可在标签上叠加「已逾期」，不替代上述结清进度文案。
_Avoid_: 与 `Payment Schedule Status` 枚举一一对应, 新增 partial 枚举

**Finance Generation（财务生成）**:
计调或财务在源事实确认后手动触发的动作，将客源单转为应收收付款节点、将行程段资源转为应付收付款节点。已生成且未 finance-touched 时可同步源事实金额；已 finance-touched 后源事实变更仅警示、不静默改账款。
_Avoid_: 保存即生成, 批量自动生成, 团款确认（Project 旧称）

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
为发团提供资源的服务商，如酒店、用车、餐、景区等。供应商档案是 Organization 内的自营资源名录，主路径是在发团执行安排中选 supplier，而非独立 ERP。一家供应商可同时提供多种资源（多选 **供应商类别**）。
_Avoid_: 资源商, vendor, 车队/餐厅（作与用车/餐对立的另一套主体称呼）

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
Supplier 名录中对该服务商 **可提供哪些资源种类** 的分类，为 **非空多选**（无主类别）。取值类型与资源行的 **资源种类** 相同（Resource Kind），但 **不含拼出**——拼出只属于资源行。列表与执行安排选供应商时，按「类别集合包含所选资源种类」筛选。编辑类别时不得移除仍被关联资源行使用的种类；资源行保存时，非拼出的资源种类必须属于该供应商的类别集合。
_Avoid_: 单选类别, 主类别+附加类别, 与资源种类维护第二套枚举, SupplierCategory 独立枚举类型, 类别当作与资源种类无关的另一套取值, 把拼出写入供应商类别, 餐厅/车队/票务（作与餐/用车/门票并列的旧 label）

**Supplier Business Notes（供应商备注）**:
Supplier 目录层关于合作事实的自由文本（如接待上限、是否支持加单）。表单与只读区 section 标题为 **备注**，非「业务备注」。
_Avoid_: 业务备注, 用备注代替结算说明

**Supplier Financial Profile（供应商更多财务信息）**:
Supplier 目录层可选区块：是否可开票、发票类型、税率、收款银行账户。在创建/编辑表单中 **默认折叠**；收款账户可再内层折叠。轻量创建时不强制填写。
_Avoid_: 创建时强制填银行账号, 与结算信息混为一段

**Finance Transaction（财务流水）**:
Organization 内的资金进出记录。
_Avoid_: 流水账, 记账

**Transaction Direction（收支方向）**:
财务流水的资金方向，存储为 `inflow` / `outflow`。产品 UI 统一 label **收入** / **支出**（不用「流入 / 流出」）。收入流水用于应收核销；支出流水用于应付核销。
_Avoid_: 流入, 流出, income, expense（作存储枚举值）

**Transaction Writeoff Amount（流水核销金额）**:
流水上已被核销记录占用的金额及其余额，由 Verification 分配 **派生**，不单独写入流水表。产品 UI label：**已核销金额**、**未核销金额**（不用「已分配 / 未分配」）。后端字段可保持 `allocatedAmountCents` / `unallocatedAmountCents`。
_Avoid_: 已分配, 未分配, writtenOffAmount（第一版不必改 API 字段名）

**Transaction Writeoff Status（流水核销状态）**:
流水可核销进度的展示状态，由已核销金额与流水金额 **派生**，不写入数据库：未核销（已核销 = 0）、部分核销（0 < 已核销 < 流水金额）、已核销（已核销 = 流水金额）。
_Avoid_: 与收付款节点 `Payment Schedule Status` 混为一谈, 新增独立存储枚举（第一版）

**Counterparty（往来对象）**:
收付款节点与财务流水上标识资金往来一方的字段，存储为 `counterpartyType` + `counterpartyId` / `counterpartyName`。产品 UI 统一 label **往来对象**、**往来对象类型**（不用「交易对象」）。类型枚举：合作伙伴（Partner）、供应商（Supplier）、客人（Guest）、手工录入（Manual）。新建/编辑流水时：合作伙伴、供应商须从目录档案选择（写入 `counterpartyId`）；客人、手工录入可手输名称。收支方向联动默认类型：收入 → 合作伙伴；支出 → 供应商。
_Avoid_: 交易对象, 客户/供应商/其他（作流水表单枚举 label，与 Partner/Guest 等领域类型混用）, 流水表单仅手输名称不接档案（第一版）

**Payment Channel（收付款通道）**:
财务流水上记录资金实际经过的通道分类，固定枚举：现金、银行转账、微信、支付宝、其他（存储如 `cash` / `bank_transfer` / `wechat` / `alipay` / `other`）。凡 **新建** 财务流水（含登记收/付款与流水页手动新建）均必选；匹配已有流水时只读展示。登记抽屉 UI label：应付侧 **付款通道**、应收侧 **收款通道**（不用「付款账户/收款账户」）。仅用于分类与列表展示，第一版 Organization 不可自定义通道；不做本社账户台账、余额或多账户管理。新建流水 **不要求** 同时存在收付款节点；可先记流水，后续再通过匹配流水核销到节点。
_Avoid_: 付款账户, 收款账户（登记抽屉 UI label）, 银行卡（UI 文案，用「银行转账」）, 账户余额, 多账户 CRUD, 新建流水必须先有收付款节点

**Verification（核销）**:
收付款节点与财务流水之间的金额分配记录，将实际资金进出与计划应收/应付对齐。
_Avoid_: 结算, 对账

**Match Transaction（匹配流水）**:
财务人员将 **已有** 财务流水与收付款节点建立核销关系的操作。登记收付款则相反：无流水时新建流水并同时核销。产品 UI、按钮与组件统称「匹配流水」；后端 HTTP 路径保持 `link-transaction`，不因产品改名而变更 API。第一版：右侧抽屉、账款/流水候选/已选流水/本次核销四块、收支方向过滤、默认核销金额取 min(流水可核销余额, 节点未结清)；**推荐标识**（同对象/同团单/金额一致）延后迭代。
_Avoid_: 关联流水（产品文案）, 匹配流水（作 API 路径名）

**Verify From Transaction（去核销）**:
财务人员从 **财务流水列表** 从某条流水发起核销的操作，与「匹配流水」互为镜像：匹配流水从收付款节点出发选流水；去核销从流水出发选收付款节点。收入流水自动进入应收核销候选；支出流水进入应付核销候选。第一版用独立抽屉 `VerifyFromTransactionDrawer`（布局镜像 `MatchTransactionDrawer`），提交复用 `createVerification`。「查看核销」跳转核销列表并按 `transactionId` 过滤（后端已支持该查询参数）。
_Avoid_: 复用手工双下拉的核销 Modal 作第一版入口, 查看核销作独立详情抽屉（第一版）

**Void Transaction（作废流水）**:
将财务流水标记为无效、不再参与新增核销。仅 **正常且未核销**（已核销金额 = 0）的流水可作废；部分或已全部核销须先撤销核销。作废 **不可恢复**；作废时 **作废原因必填**（前后端均校验）。已作废流水列表仍可查看，但不展示作废按钮。
_Avoid_: 已核销流水直接作废, 作废原因可选, 作废后可恢复（第一版）

**Edit Transaction（编辑流水）**:
修正尚未进入账务闭环的流水录入。仅 **正常且未核销**（已核销金额 = 0）可编辑；部分或已全部核销不可改核心字段，须先撤销核销。可编辑字段：收支方向、流水金额、交易日期、收付款通道、往来对象、关联发团、流水备注。未核销流水视为孤立资金记录，允许直接 UPDATE，不必作废重建。
_Avoid_: 已核销流水静默改字段, 未核销也必须作废重建（第一版）, 编辑流水号

**Finance Transaction List Filters（财务流水列表筛选）**:
第一版 P0 筛选项：交易日期范围（默认近 30 天）、收支方向、往来对象关键字、核销状态、流水号、关联发团、**流水状态**（正常/已作废）。收付款通道筛选、高级组合延后 P1。
_Avoid_: 第一版仅筛选发团, 流水状态筛选延后（实现成本低且常用）

**Finance Transaction List Columns（财务流水列表列）**:
第一版 P0 必显：流水号、收支方向、流水金额、已核销金额、未核销金额、交易日期、往来对象、收付款通道、核销状态、流水状态、操作。**创建时间**可选加列（已有 `createdAt`，零 schema 变更）。**经办人**（`createdBy`）需 schema 与创建链路改造，延后 P1。流水号点击打开详情抽屉（见下）。
_Avoid_: 第一版必显经办人, 流水号纯展示不可点

**Finance Transaction Detail（流水详情抽屉）**:
第一版 P0 实装详情抽屉（点击流水号打开）：**基础信息**、**核销信息**（已核销/未核销/笔数/最近核销时间）、**核销记录列表**。**操作记录**块延后后续迭代（当前无 audit 表；创建/编辑/作废/核销的完整操作人追溯一并后续补齐）。
_Avoid_: 第一版详情抽屉整体延后, P0 为操作记录新建 audit 表

**Register Payment / Receipt（登记付款 / 登记收款）**:
财务人员在尚无财务流水时，从收付款节点直接录入实际收付款：系统新建财务流水（含收付款通道）并同时生成核销。产品确认按钮文案为「确认付款并核销 / 确认收款并核销」；后端路径保持 `confirm-payment` / `confirm-collection`。登记抽屉：只读区含应付/应收单号、标题、关联发团、往来对象、总额/已结/未结、核销后未结金额（随输入金额实时计算）；可编辑区含收付金额、收付款通道、交易日期、**流水备注**（写入财务流水，非节点备注）。通道下拉不另附 helper 文案。底部次要说明：应付侧「确认后将生成一条支出流水，并自动完成本次核销」；应收侧「确认后将生成一条收入流水，并自动完成本次核销」。
_Avoid_: 仅确认付款（文案不清会否核销）, 登记时不填收付款通道, 通道字段下方重复枚举 helper, 备注（作登记抽屉 label，用「流水备注」）, 底部说明不区分收支方向

**Payment Schedule List Actions（收付款节点列表操作）**:
全局应收/应付列表操作列：可结算时外露「登记收款/登记付款」与「匹配流水」；「编辑」「关闭节点」「查看核销」收进「更多」。查看核销跳转核销列表并按当前收付款节点过滤，第一版不做独立核销详情抽屉。
_Avoid_: 四按钮平铺, 查看核销作独立详情页（第一版）
