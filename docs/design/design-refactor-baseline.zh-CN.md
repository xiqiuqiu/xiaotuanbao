# apps/web 样式重构基线审计

## 审计基线

- 基准提交：`5d322da88587b804274a9932a749ed39281216f5`
- 唯一视觉规范：根目录 `DESIGN.md`
- 审计范围：应用壳、全部路由入口、代表页面及其直接关联的 Drawer、Modal、筛选区、表格与 CSS Module
- 审计方法：源码逐项检查 `ui-audit` A1–A14，结合 Ant Design v6 组件/Token 元数据；本阶段只记录，不做大面积视觉修改

## 页面清单与 Design QA 代表页

| 场景 | 路由 | 主要入口文件 | QA 重点 |
|---|---|---|---|
| 登录页 | `/login` | `pages/LoginPage.tsx`、`LoginPage.module.css` | 品牌特例、对比度、焦点、双栏与移动端 |
| 工作台 | `/` | `pages/HomePage.tsx` | 页头层级、统计摘要、Loading/Error/Success |
| 员工管理 | `/system/users` | `pages/system/EmployeesPage.tsx`、`employees/*` | 标准列表骨架、分页、Drawer、停用确认 Modal |
| 合作伙伴列表 | `/partner` | `features/partner/pages/PartnersPage.tsx` | 筛选、表格、唯一主操作 |
| 供应商详情 | `/supplier/:supplierId` | `features/supplier/pages/SupplierDetailPage.tsx` | 详情层级、Descriptions、编辑 Drawer |
| 发团详情 | `/departure/:departureId` | `features/departure/pages/DepartureDetailPage.tsx` | 多 Tabs、执行安排、状态与财务摘要、窄屏 |
| 收支流水 | `/finance/transactions` | `features/finance/components/TransactionsWorkspace.tsx` | 高密度筛选、金额/状态/操作列、横向滚动 |
| 收付款节点 | `/finance/receivable`、`/finance/payable` | `features/finance/components/PaymentScheduleWorkspace.tsx` | 复杂筛选、详情 Drawer、危险动作 |
| 核销工作区 | `/finance/verification` | `features/finance/components/VerificationsWorkspace.tsx` | 关联事实、撤销核销 Modal、空态与错误态 |

Drawer 代表采用员工创建/编辑与收付款节点详情；危险确认 Modal 采用员工停用，并补查流水作废或核销撤销。

## 偏差清单

| ID | 当前问题 | DESIGN.md 规则 / Catalog | 影响页面 | 严重度 | 建议阶段 |
|---|---|---|---|---|---|
| B01 | `ConfigProvider` 仅配置主色与 6px 圆角，布局底、工作面、边框、字体、容器圆角及核心组件表现未形成统一基线 | 主题唯一入口；A2、A7、A13 | 全站 | P1 | 阶段二 |
| B02 | 应用壳在窄屏仍保留固定侧栏占位；折叠依赖手动操作，Header 用户区与 Breadcrumb 缺少收敛策略 | 主壳与响应式结构规则；A6、A13 | 所有登录后页面 | P1 | 阶段二 |
| B03 | 壳层结构主要依赖行内样式，品牌区、折叠按钮与 Content 没有统一的语义类和移动触控规则 | Navigation、移动端 44px；A6、A7 | 全站 | P1 | 阶段二 |
| B04 | 工作台页标题使用 `Title level={3}`，与标准页面 `level={4}` 不一致 | 标题层级；A5 | 工作台 | P2 | 阶段三 |
| B05 | 标准列表页虽大多接近“页头→筛选→表格”，但页头实现重复、操作随筛选区/页头漂移，响应式换行不一致 | 页面骨架；A4、A6 | 员工、合作伙伴、供应商、发团、财务列表 | P1 | 阶段三 |
| B06 | 页面标题、副文案、主操作缺少共享而克制的布局约束，窄屏下可能互相挤压；不应为此建立过度抽象 | 页面骨架、结构式响应；A4、A6 | 标准列表与财务页 | P1 | 阶段三 |
| B07 | 登录页存在多组裸 hex/rgba、10/12px 例外圆角及 Card 同时使用边框和 24px 模糊阴影 | 登录特例、无裸色值、静态不漂浮；A2、A7 | 登录页 | P1 | 阶段五 |
| B08 | 登录页输入图标使用行内 `rgba`，表单与品牌文案的次级色对比度需在真实页面验证 | Login Exception、WCAG AA；A2、A10 | 登录页 | P2 | 阶段五 |
| B09 | 执行安排 CSS 以自建 `--execution-*` 并带 hex/rgba fallback 消费视觉值，容易形成页面级 Token 系统 | 主题唯一入口、无平行 Token；A2 | 发团详情执行安排 | P1 | 阶段四 |
| B10 | 收付款节点 CSS 使用 `--ant-*` fallback 裸色，主题消费路径不够明确 | 无裸色值；A2 | 应收/应付工作区 | P1 | 阶段四 |
| B11 | 多处详情/复杂工作区以固定 48px Loading/Empty padding 呈现；虽在网格上，但密度与移动端占用需统一验证 | Loading/Empty、结构式响应；A6、A10 | 发团、供应商、合作伙伴详情 | P2 | 阶段四 |
| B12 | 发团详情包含 7 个 Tabs，复杂 Drawer 可达 960px；390px 下存在 Tab 可发现性、Drawer 溢出和 footer 可触达风险 | Tabs、Drawer、窄屏规则；A8、A10 | 发团详情 | P1 | 阶段四 |
| B13 | 表格普遍已有 loading、总数、page size 与横向滚动基础，但金额右对齐、状态/操作列稳定性仍需逐域核验 | Tables；A9、A10 | 发团与财务工作区 | P2 | 阶段三/四 |
| B14 | 部分页面只处理 loading，查询失败时可能退化为空表，用户无法区分“无数据”与“加载失败” | Feedback；A10 | 员工、目录与财务列表 | P1 | 阶段三/四 |
| B15 | 危险确认已广泛使用 Modal/专用 Modal，但需核验对象、后果、loading 与键盘焦点是否完整 | Destructive；A12 | 员工停用、目录删除、流水作废、核销撤销、节点关闭 | P1 | 阶段四/六 |
| B16 | 非理想态覆盖不均：Disabled 多由 antd 默认承担，Permission Denied、请求错误和空态下一步缺少统一实页证据 | Feedback；A10 | 全站 | P2 | 阶段三至六 |

## 组件维度结论

- Button：已有 Ant Design 语义基础；需确保每个决策面仅一个 `primary`，移动端主操作触控区达到 44px。
- Card：统计与真实分组基本合理；后续重点消除无意义外层/嵌套和自定义静态阴影。
- Table：多数列表已有分页总数与 page size；需补错误态证据、金额对齐及窄屏横向滚动。
- Form：多数创建/编辑流程已使用垂直 Drawer Form；需统一宽度、footer、loading 与移动端占满可用宽度。
- Tabs / Tag：使用标准 antd 语义；复杂详情须验证 Tab 溢出，关键状态继续保留中文文字。
- Drawer / Modal / Descriptions：交互形态总体符合规范；主要风险在复杂宽度、层级、危险后果说明和焦点管理。

## 桌面与窄屏基线

- 桌面：220px Sider、64px Header、Content 16px 外边距已存在，但层级 Token 与统一工作面尚未完整落地。
- 窄屏：当前没有足够的壳层自动折叠/覆盖策略；固定侧栏会显著压缩 390px 内容区，是进入页面重构前必须先解决的 P1。
- 高密度表格：应保留信息密度，通过横向滚动、稳定列宽和次要列收敛解决，不改造成卡片列表。

## 明确非目标

- 不修改 API、数据库、请求模型、权限规则或业务状态机。
- 不更名 `CONTEXT.md` 已确定的领域术语，不重新设计业务流程。
- 不替换 Ant Design，不新增与 `ConfigProvider` 平行的 Token 系统。
- 不复制参考图的黑色主按钮、彩色装饰卡片、超大英文标题或固定超宽布局。
- 不替换登录页品牌资产，不以截图专用魔法数修饰页面。
- 不在本次视觉重构中顺手抽象无关业务组件或扩大到 `apps/api`。

## 阶段出口

阶段一只形成基线与页面清单。后续按“主题与应用壳 → 标准页面骨架 → 复杂业务工作区 → 登录页特例 → 全量 Design QA”推进；每阶段独立验证并提交，P0/P1 未清零前不进入最终验收。
