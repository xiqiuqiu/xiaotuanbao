# 小团宝 UI 设计约束

> 本文件是 `apps/web` 后续 UI 开发的约束套件。视觉语言对齐 [Ant Design Design Tokens](https://ant.design/design.md)（antd v6 默认浅色主题），并结合本仓库已落地的中后台模式。
>
> **优先级**：本文件 > 个人审美偏好。冲突时以本文件与 antd 组件默认为准，不要发明平行视觉体系。

## 产品语境

小团宝是面向中小地接旅行社的 **B 端 SaaS 中后台**：团单、财务、供应商、组织权限等运营台。界面目标是 **信息密度、状态确定、操作可预期**，不是营销落地页。

- 默认浅色主题；不引入暗色作为默认体验。
- 中文界面；`ConfigProvider` 使用 `zh_CN`。
- 主题入口：`apps/web/src/app/providers/AppProviders.tsx`。改色、改圆角、改字号，只改 seed token，不散落硬编码。

## 设计价值观（决策平局时用）

对齐 Ant Design 四大价值观，作为取舍标准：

| 价值 | 含义 | 在本项目中的落地 |
|------|------|------------------|
| **自然** | 遵循已有约定，不制造惊喜 | 优先 antd 组件与既有页面骨架；少造自定义控件 |
| **确定** | 用户始终知道所处状态与下一步 | Hover / Focus / Loading / Error / Empty 必须可见且一致 |
| **意义感** | 视觉强调只服务行动 | 一屏一个主操作；去掉不传达信息的装饰 |
| **生长性** | 从简单表单到密表、多模块仍连贯 | 列表 / 筛选 / 抽屉 / 详情共用同一套间距与层级 |

## 主题 Seed（唯一品牌入口）

当前已配置：

```ts
// AppProviders.tsx
token: {
  colorPrimary: '#1677ff',
  borderRadius: 6,
}
```

| Seed | 值 | 用途 |
|------|-----|------|
| `colorPrimary` | `#1677FF` | 主按钮、链接、选中导航、焦点环、激活 Tab |
| `colorSuccess` | antd 默认 | 成功、启用、正向完成 |
| `colorWarning` | antd 默认 | 预警、待处理、需关注 |
| `colorError` | antd 默认 | 失败、危险操作、作废 |
| `colorInfo` | antd 默认（通常贴近 primary） | 信息提示 |
| `borderRadius` | `6` | 控件默认圆角；表面容器由算法派生为更大一档 |

**禁止**：

- 在业务组件里硬编码 `#1677ff` / `#FFF` / `#FAFAFA` / 随意灰阶。
- 为单页另起一套主色或「品牌渐变按钮」。
- 用 preset 色（`purple` / `magenta` / `volcano` 等）做主操作或导航选中态。

需要消费 token 时：`theme.useToken()` 或 `ConfigProvider` 的 `theme.token` / `theme.components`。

## 颜色角色

### 功能色 vs 分类色

- **功能色**（`success` / `warning` / `error` / `info` + `primary`）：状态、反馈、主行动。
- **Preset 色**（`blue`…`lime`）：仅用于 Tag、图表、多维分类；**不是**主 UI 强调色。
- 每屏 **最多一个** `primary` 实心按钮；其余用 `default` / `text` / `link`。

### 中性文字（优先 alpha，导出用合成 hex）

| 角色 | 约值（白底合成） | 用法 |
|------|------------------|------|
| 主文案 | `#1F1F1F`（≈ rgba(0,0,0,0.88)） | 标题、表体、表单值 |
| 次要 | `#595959`（≈ 0.65） | 说明、辅助信息 |
| 第三级 | ≈ 0.45 | 描述、次要元数据 |
| 占位/禁用 | `#BFBFBF`（≈ 0.25） | placeholder、disabled |

用 `Typography.Text type="secondary"` / `disabled` 等语义 API，不要手写灰色。

### 三层表面

| 层 | Token 角色 | 典型值 | 用法 |
|----|------------|--------|------|
| 布局底 | `colorBgLayout` | `#F5F5F5` | 页面背景，包住内容区 |
| 容器 | `colorBgContainer` | `#FFFFFF` | Card、表、表单、Header、Sider |
| 浮层 | `colorBgElevated` | `#FFFFFF` | Modal / Dropdown / Popover（靠阴影区分，不靠换色） |

内容区外边距已由布局提供（见下）；不要再给整页套一层「假卡片底」。

## 字体

- 基准字号 **14px**（企业台密度，不是 16px 营销站）。
- 字重只用 **400** 与 **600**（`fontWeightStrong`）。不用 100–300、700+、斜体做界面强调；选中态靠颜色与描边。
- 字体栈与 antd / `global.css` 一致：系统 UI 字体优先（`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, …）。
- 业务编号、流水号可用 `Typography.Text code`，不要整表等宽。

### 标题层级（本仓库约定）

| 场景 | 用法 |
|------|------|
| 登录品牌名 | `Typography.Title level={2}` |
| 工作台等少见大标题 | `level={3}` |
| **列表/模块页标题（默认）** | `level={4}`，`marginTop: 0`，下接一行 `Paragraph type="secondary"` |
| 抽屉/卡片内小节 | `level={5}` 或 `Text strong` |

不要在同一页堆多个 `level={2/3}` 抢层级。

## 间距与栅格

一切间距落在 **4px 网格**。优先使用 antd 间距阶梯：

| 阶 | 尺寸 | 常见用途 |
|----|------|----------|
| xs / unit | 4 | 紧凑内边距、图标与文字间隙 |
| sm | 8 | 控件内小间距 |
| md | 16 | **页面内容区 margin、筛选与表间距、Header 水平 padding、gutter** |
| lg | 24 | Card 内边距、区块之间、统计卡 Row 的纵向节奏 |
| xl | 32 | 大区块分隔（少用） |

**禁止** `11px` / `13px` / `15px` 等魔法数。若现有 antd 控件内部有历史例外，交给组件，业务侧不要再加。

布局已约定：

- 侧栏宽 **220**（折叠走 antd `Sider`）。
- 主内容：`Layout.Content` **`margin: 16`**（`AppLayout`）。
- 页头区：标题组与主按钮同一行，`marginBottom: 16`；标题与副文案间距约 4。

## 圆角

| 对象 | 圆角 |
|------|------|
| 按钮、输入、Select 等控件 | 6（`borderRadius`） |
| Card / Modal / Drawer 等表面 | ≈ 8（算法派生） |
| Tag / Tooltip / 小芯片 | ≈ 4 |
| 全圆角 | **仅** Avatar、Badge 圆点；**禁止** 胶囊主按钮、胶囊 Tag 当默认 |

相邻元素圆角档位应一致：8 的 Card 里不要塞 16 圆角的自定义块。

## 海拔与动效

- **扁平优先**：层级主要靠边框与底色差；阴影只给真正浮起的层。
- 浮层用 antd 阴影 token（`boxShadow` / `boxShadowSecondary` / `boxShadowTertiary` / `boxShadowCard`），不要手写多层 `box-shadow`。
- 动效只用 antd 时长与缓动：
  - Fast `0.1s` — hover / focus / press
  - Mid `0.2s` — 组件内展开、淡入（默认兜底）
  - Slow `0.3s` — Modal / Drawer
- **禁止** 自定义 `cubic-bezier`、弹跳、炫光、大面积装饰动画。

## 布局骨架

### 已登录主壳

```
Sider(light, 220) | Header(容器底 + 底边框) 
                  | Content(margin 16)
```

- Sider / Header 分隔用 `token.colorBorderSecondary`，不要重阴影。
- 导航选中：antd Menu 默认（浅主色底 + 主色字），不要改成高饱和色块。
- 品牌名在侧栏：折叠显示「团」，展开显示 `env.appName`；字重 600。

### 登录壳

- 居中卡片，宽约 400 / `maxWidth: 90vw`。
- 背景可用极淡主色向白的渐变（现有 `linear-gradient(135deg, #f0f5ff, #ffffff)`）；**不要**上大图、插画墙、玻璃拟态。

### 标准列表页（默认模板）

1. **页头**：左标题 + 副文案；右 **一个** `Button type="primary"`（可带图标）。
2. **可选统计**：`Row` + `Col` + `Card` + `Statistic`，`gutter={[16, 16]}`。
3. **筛选**：`Card` 包一层，`Space wrap` 放控件；与下方表格间距 16。
4. **表格**：`Card` > `Table`；分页 `showSizeChanger` + `showTotal: (t) => \`共 ${t} 条\``。
5. **创建/编辑**：右侧 `Drawer`（常见宽度 **480**），`Form layout="vertical"`；footer 右对齐：取消（default）+ 主按钮（primary）。
6. **危险确认 / 短流程**：`Modal`；详情浏览优先 Drawer，避免为只读详情新开路由（除非已有详情页模式，如供应商/合作伙伴）。

### 详情页

- 顶栏：返回/标题/状态 Tag/主操作，信息分区用 Card 或 antd 描述列表，保持 16/24 节奏。
- 多 Tab 时用 `Tabs`：激活为 **主色字 + 2px 主色下划线**，无背景填充。

## 组件用法约束

### Button

| 类型 | 何时用 |
|------|--------|
| `primary` | 该决策面的唯一主行动（创建、保存、提交、确认收款…） |
| `default` | 次要行动（取消、重置、导出若非主路径） |
| `text` / `link` | 表格行内操作、辅助导航 |
| `primary` + `danger` / `danger` | 破坏性操作；行内停用/作废用 `link` + `danger` |

同一 footer / 页头 **禁止两个 primary**。

### Form

- 默认 `layout="vertical"`（与现有 Drawer 一致）。
- 校验文案中文、指向动作（「请输入…」）。
- 提交按钮 `loading` 绑定 mutation；成功 `message.success`，失败 `message.error`。

### Table

- 表头用组件默认（容器底 + 加粗），**不要**默认斑马纹；hover 高亮即可。
- 行内主字段可 `Button type="link"` 打开详情。
- 状态用 `Tag` + 语义色（`success` / `default` / 业务 catalog 色）；关键状态同时保留文字，不只靠色点。

### Tag / Alert / Badge

- Tag：分类与状态标签，小圆角、浅底；**不**代替 Alert 传达阻断性错误。
- Alert：页级或卡片级反馈，靠图标 + 浅语义底，正文保持可读对比。
- Badge 圆点：辅助指示；无障碍关键流程必须有文字。

### Feedback

- 轻反馈：`message`（成功/失败）。
- 阻断确认：`Modal` / `Popconfirm`。
- 表单错误：字段校验 + 必要时顶栏 `Alert`。
- 静态 `message.xxx` / `Modal.xxx` 注意主题上下文；优先挂在已有 `ConfigProvider` 树下，或后续统一 `App` 包裹。

### 空态与加载

- 表格/列表：`loading` + 空数据用 Table 默认空态或 `Empty`。
- 整页等待：`Spin`；错误：`Alert type="error|warning"`，给出可执行下一步。

## Do / Don't

**Do**

- 先查 antd 组件是否已覆盖，再写自定义 UI。
- 改视觉只动 `ConfigProvider` seed / `theme.components`。
- 一屏一个主色实心按钮；间距走 4px 网格。
- 状态（选中、禁用、加载、错误）显式且全站一致。
- 文案与领域词遵守根目录 `CONTEXT.md`。

**Don't**

- 不要引入第二套组件库或平行 CSS 设计系统。
- 不要硬编码表面色、主色、随意阴影与圆角。
- 不要用大面积渐变、玻璃拟态、紫色炫光、重阴影卡片墙（登录淡渐变除外）。
- 不要把 preset 色当品牌色；不要用全圆角按钮。
- 不要为「好看」降低信息密度或藏起状态。
- 不要在无障碍要求下依赖低对比主色小字；若需严格 AA，通过加深 `colorPrimary` 或组件 token 解决，而不是局部魔法色。

## 定制边界

允许：

1. 调整 seed（主色、圆角、字号、中性底）。
2. `theme.algorithm`（含 `compactAlgorithm`）做密度实验。
3. `theme.components.X` 做单组件微调。

不允许：

- 绕过 token 写大段覆盖 antd 内部结构的 CSS。
- 在业务页复制一套「设计系统变量文件」与 ConfigProvider 双轨。
- 营销向布局侵蚀业务台（除非独立品牌页且明确不走本约束）。

主题能力以 antd「定制主题」为准：算法派生、组件级覆盖、嵌套 `ConfigProvider`、`theme.useToken()`。

## 实现检查清单（提 PR / 写 UI 前）

- [ ] 是否复用「页头 + 筛选 Card + 表格 Card + Drawer/Modal」骨架？
- [ ] 是否只有一个 primary 主按钮？
- [ ] 间距是否均为 4 的倍数（优先 8/16/24）？
- [ ] 颜色是否来自 token / 语义 props，而非裸 hex？
- [ ] 状态色是否用功能色，分类色是否仅用于 Tag/图？
- [ ] 圆角是否未出现胶囊按钮 / 混用过大圆角？
- [ ] 反馈是否具备 loading / success / error？
- [ ] 文案术语是否符合 `CONTEXT.md`？

## 参考

- Ant Design 视觉与 Token：[design.md](https://ant.design/design.md)
- 设计价值观概述：[Ant Design 介绍](https://ant.design/docs/spec/introduce-cn)
- 主题配置：`apps/web/src/app/providers/AppProviders.tsx`
- 主布局：`apps/web/src/layouts/MainLayout.tsx`、`AppLayout.tsx`
- 列表页范例：`apps/web/src/pages/system/EmployeesPage.tsx`
- 领域用语：`CONTEXT.md`
