---
name: 小团宝
description: 克制、可靠、清晰的旅行社运营工作台
colors:
  primary: "#1677FF"
  primary-hover: "#4096FF"
  primary-active: "#0958D9"
  ink: "#1F1F1F"
  ink-secondary: "#595959"
  ink-tertiary: "#8C8C8C"
  layout: "#F5F5F5"
  surface: "#FFFFFF"
  surface-subtle: "#FAFAFA"
  border: "#D9D9D9"
  border-subtle: "#F0F0F0"
  success: "#52C41A"
  warning: "#FAAD14"
  error: "#FF4D4F"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5715
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  control: "6px"
  container: "8px"
spacing:
  unit: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "4px 15px"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "4px 15px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.container}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
---

# Design System: 小团宝

> 本文件是 `apps/web` 唯一视觉规范。参考图提供结构与气质，不提供可直接复制的品牌色或业务组件。发生冲突时，优先级为：本文件 → Ant Design v6 语义与 Token → 现有页面惯例 → 个人偏好。

## Overview

**Creative North Star: “清晰运营台”**

小团宝是面向中小地接旅行社的 B 端 SaaS。用户在桌面端持续处理高密度业务数据，因此视觉目标是让对象、金额、状态、异常和下一步操作一眼可辨，而不是制造营销感或视觉奇观。

四张参考图值得继承的是：大面积低饱和中性底、白色工作面、细边框分层、紧凑但整齐的信息密度、稀少而明确的强操作、统一的圆角与图标语言。不能直接继承的是黑色主按钮、装饰性彩色模块、过大的英文页标题和依赖超宽画布的固定布局。

**核心特征：**

- 浅色、低饱和、边框主导，阴影克制。
- 一屏一个视觉主操作，品牌蓝只用于行动、选中与信息反馈。
- 采用熟悉的 antd 表格、表单、Card、Tabs、Drawer 与 Modal 语义。
- 以 4px 网格组织紧凑内容；用留白分组，不用层层套卡片。
- 所有术语遵守根目录 `CONTEXT.md`，状态不只靠颜色表达。

### 实现边界

- 主题唯一入口：`apps/web/src/app/providers/AppProviders.tsx`。
- 页面消费 `theme.useToken()` 或 antd 语义属性；不新增平行 CSS Token 系统。
- 主壳保持现有结构：浅色 `Sider` 220px + `Header` 64px + `Content` 16px 外边距。
- 响应式是结构变化：侧栏折叠、筛选换行、表格横向滚动、详情列数收缩；不使用流式大标题。
- 默认桌面优先；小于 768px 时，页头操作允许换行，抽屉优先占满可用宽度，关键触控目标至少 44px。

### 页面骨架

1. 页头：`Title level={4}` + 一行次要说明；右侧最多一个主按钮。
2. 可选摘要：只展示支持决策的 3–6 个指标，使用同一 Row，不嵌套 Card。
3. 查询区：简单条件用 `Space wrap`；复杂条件使用单层 Card。
4. 主工作区：表格、分组列表或业务面板只选一种主结构；避免“Card 里面再套 Card”。
5. 编辑流程：长表单用右侧 Drawer；短确认用 Modal/Popconfirm；只读详情按业务连续性选择 Drawer 或既有详情路由。

## Colors

配色采用“中性工作面 + 稀疏品牌蓝 + 语义状态色”。参考图的黑白克制感通过中性色占比实现，不把主操作改成黑色。

### Primary

- **小团宝蓝** `#1677FF`：主操作、链接、焦点、当前选中、关键图表系列。单屏面积应明显低于中性色。
- Hover 使用 `#4096FF`，Active 使用 `#0958D9`；由 antd 算法派生，业务页面不硬编码。

### Neutral

- **主墨色** `#1F1F1F`：标题、表格主体、表单值。
- **次墨色** `#595959`：辅助说明、字段描述、次级信息。
- **第三层文字** `#8C8C8C`：时间、来源等非关键元数据；不能承载必须阅读的正文。
- **布局底** `#F5F5F5`：应用壳和页面间隙。
- **工作面** `#FFFFFF`：Header、Sider、Card、Table、Drawer、Modal。
- **轻表面** `#FAFAFA`：表头、工具条、分组底，不用作整页主体。
- **边框** `#D9D9D9`：输入与明确分区；**弱边框** `#F0F0F0`：分割线和轻容器。

### Semantic

- Success `#52C41A`、Warning `#FAAD14`、Error `#FF4D4F`、Info 跟随 Primary。
- 功能色只表达状态和反馈；preset 色只用于 Tag、图表或互斥分类。
- 关键状态必须同时有中文 label，禁止只放彩色圆点。

**“蓝色要稀有”规则。** 同一决策面最多一个实心 `primary`；导航选中、链接和焦点可使用蓝色，但不能把多个普通 Card、标题或图标同时染蓝。

**“无裸色值”规则。** 除 `AppProviders.tsx` 的 seed、品牌资产和明确记录的登录页特例，业务代码禁止新增 hex、rgb、hsl；使用 token 或组件语义属性。

## Typography

**Display Font:** 不设置独立展示字体

**Body Font:** 系统 UI 字体栈

**Label/Mono Font:** 默认不使用等宽字体

字体气质应准确、安静、耐久。参考图的大号英文标题不适合高密度中文后台；本项目使用紧凑的固定字号阶梯，不使用 `clamp()` 或营销式超大标题。

### Hierarchy

- **Page Headline**：20px / 600 / 1.4；默认用 `Typography.Title level={4}`，上边距 0、下边距 4。
- **Section Title**：16px / 600 / 1.5；用 `Title level={5}` 或 `Text strong`。
- **Body**：14px / 400 / 1.5715；表格、表单、正文默认层级。
- **Label / Metadata**：12px / 400 / 1.5；仅用于非关键元数据，不把主要操作缩成 12px。
- **Number**：统计金额和数量使用 antd `Statistic` 或 600 字重正文；保留货币符号、千分位和业务单位。

字重只使用 400 和 600。业务编号默认沿用正文字体；仅机器内容或需要逐字符比较的值使用等宽字体。空值统一显示半角短横 `-`。

**“标题不抢任务”规则。** 每页只允许一个页面标题；不使用 32px 以上标题，不用全大写、斜体或超粗字重制造层级。

## Elevation

系统采用“色面 + 细边框”的结构性分层。静态内容默认不使用阴影；Header、Sider 与工作区由背景差和 `colorBorderSecondary` 分开。Drawer、Modal、Dropdown、Tooltip 等真正浮层使用 antd 内置阴影。

- **Level 0**：页面、Card、Table，依靠底色与 1px 边框，无自定义阴影。
- **Level 1**：悬停或拖动反馈，优先边框/底色变化；确需阴影时只用 antd token。
- **Level 2**：Drawer、Modal、Dropdown、Popover，使用 `boxShadowSecondary` 等框架 token。

动效只表达状态：Hover/Focus 约 100ms，组件展开 200ms，Drawer/Modal 300ms。禁止弹跳、炫光、连续装饰动画；自定义动效必须提供 `prefers-reduced-motion` 降级。

**“静态不漂浮”规则。** 不在同一个 Card 上叠加 1px 边框与大于 8px 模糊的装饰阴影，不用阴影制造无业务意义的卡片墙。

## Components

所有交互组件必须覆盖 default、hover、focus、active、disabled；异步操作还必须覆盖 loading、success、error。

### Buttons

- 控件圆角 6px，桌面默认高度沿用 antd 32px；移动端主要操作至少 44px 触控区域。
- `primary` 只用于当前决策面的唯一主行动；页头、Drawer footer、Modal footer 各自视为独立决策面。
- `default` 用于取消、重置、导出等次级行动；`text`/`link` 用于表格行内和辅助导航。
- 破坏性操作使用 `danger`，确认文案必须说明对象与后果。
- 图标按钮必须有 `aria-label` 或 Tooltip；不要用参考图中的纯图标工具条替代不熟悉的业务动作。

### Cards / Containers

- 容器圆角约 8px，背景 `colorBgContainer`；内部 padding 默认 24px，紧凑数据容器可用 16px。
- Card 用于真实分组，不用于给每段文字加边框。统计卡同层并列，禁止再套外层 Card。
- 复杂工作区可采用参考图的“浅底分组 + 白色内容面”，但最多两层表面。
- 详情页优先 `Descriptions`、分区标题和分割线，不把每个字段做成独立卡片。

### Inputs / Fields

- 默认 `Form layout="vertical"`；Label 14px，帮助信息使用次要文字。
- 输入、Select、DatePicker 等保持相同 size 和 6px 圆角；同一行不混用不同高度。
- Focus 使用 antd 主色边框与焦点环；Error 使用组件校验状态，不只显示顶部 message。
- 搜索是筛选条件之一时放入筛选区，不重复在页头和表格上方各放一个搜索框。

### Tables / Lists

- 表头保持浅中性底与 600 字重；默认不使用斑马纹，Hover 提供行定位。
- 列顺序遵循“主对象 → 关键业务量 → 状态 → 时间/责任人 → 操作”。
- 行内主字段可用 Link 打开详情；操作列保持最右并防止换行。
- 金额右对齐，数量和状态按比较需求对齐；长文本省略时提供可访问的完整内容。
- 分组表格只在分组本身影响决策时使用；不要照搬参考图把普通列表切成多张卡片。
- 分页统一显示总数并允许切换 page size；窄屏优先横向滚动或收敛次要列，不强行把所有列堆成卡片。

### Tags / Status / Progress

- Tag 用于短状态和分类，圆角约 4px；不把默认 Tag 做成胶囊按钮。
- Success/Warning/Error 等语义色用于业务状态；分类色由各领域 `catalog.ts` 统一映射。
- 进度仅在存在真实连续度量时使用 `Progress`，不能用进度条装饰普通状态。

### Navigation

- 保持现有浅色 Sider 220px、Header 64px；折叠态显示图标并保留 Tooltip。
- Menu 默认态使用中性文字，选中态使用 antd 的浅主色底 + 主色文字；不复制参考图的黑色选中按钮。
- Breadcrumb 只表达层级，不重复当前页全部标题信息。
- Tabs 使用主色文字 + 2px 指示线，无实心背景；Tab 数量过多时优先重组信息架构。

### Drawers / Modals / Feedback

- 创建、编辑和连续上下文详情优先 Drawer；常规宽度 480px，复杂核销/资源流程可按内容扩大。
- Modal 仅用于短流程、阻断确认和危险操作，不承载长表单。
- Drawer footer：取消在左/前，唯一主按钮在右/后；提交绑定 loading，防止重复操作。
- 成功用 `App.useApp()` 提供的 message；失败优先字段错误或页内 Alert，再补全局 message。
- 加载优先 Table/Card 自带 loading 或 Skeleton；整页初始化才使用 Spin。空态必须解释原因并提供可执行下一步。

### Login Exception

登录页是独立品牌入口，可保留插画、双栏构图、较大品牌标题和极淡品牌色背景，但必须满足可读性与响应式要求。该特例不能扩散到登录后的业务页面；现有硬编码颜色和阴影应逐步通过组件变量或主题 token 收敛。

## Do's and Don'ts

### Do:

- **Do** 优先复用 antd 组件和现有“页头 → 筛选 → 主工作区 → Drawer/Modal”骨架。
- **Do** 只在 `AppProviders.tsx` 调整 seed 或 `theme.components`，业务页通过 token 消费视觉值。
- **Do** 使用 4px 网格，常用 8/16/24px；相邻区块留白必须体现层级。
- **Do** 保留参考图的中性克制、细边框、稀疏强调和高扫描效率。
- **Do** 为 Loading、Empty、Error、Disabled、Permission Denied 等非理想状态设计可执行反馈。
- **Do** 在 PR 前核对 `CONTEXT.md` 术语、唯一主操作、键盘焦点、颜色对比和窄屏行为。

### Don't:

- **Don't** 直接复制参考图的黑色主按钮、英文超大标题、彩色装饰图标或固定超宽布局。
- **Don't** 新增第二套组件库、CSS Token 文件或页面级主题。
- **Don't** 在业务组件新增裸 hex、任意灰阶、渐变文字、玻璃拟态、紫色炫光或重阴影。
- **Don't** 使用大于 12px 的业务 Card 圆角、默认胶囊按钮、带粗彩色侧边条的卡片。
- **Don't** 同时给静态 Card 添加边框和宽模糊阴影，不制造嵌套卡片墙。
- **Don't** 用纯颜色、单独图标或无文字进度条表达关键业务状态。
- **Don't** 为追求整齐截断关键金额、状态、责任人或操作后果。
- **Don't** 在两个页面为同一动作使用不同按钮层级、名称或反馈方式。

实现检查：主题值来自 token；一屏一个主操作；间距落在 4px 网格；状态含文字；表格可扫描；危险操作说明影响；焦点可见；移动端主要操作可触达；术语符合 `CONTEXT.md`。
