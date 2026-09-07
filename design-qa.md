> 2026-09-07：本文为历次检查记录，不代表当前原型全量验收。最新设计见 `docs/prd/2026-09-07-business-object-agent-collaboration.md`，本轮回归见 `docs/design/prototypes/wf-03-create-departure/current-design-qa.md`。旧字段、全局入口和容量阻断结论不再有效。

# 发团线路视图 Design QA

## 对照信息

- Source visual truth:
  - `/var/folders/bl/f3j25y8d4jz3yldslb4vyfkw0000gn/T/codex-clipboard-ffdd3c62-0b9a-4ff7-9f1e-430e20ccc74b.png`
  - `/var/folders/bl/f3j25y8d4jz3yldslb4vyfkw0000gn/T/codex-clipboard-fa07722c-0905-4159-88f1-48731f82db68.png`
- Implementation:
  - `http://localhost:5173/departure?view=route-ledger&routeName=%E4%B9%8C%E9%95%87%E8%A5%BF%E6%A0%852%E6%97%A5%E7%BA%BF&startDateFrom=2026-07-26&startDateTo=2026-07-26`
- Implementation screenshots:
  - `docs/design/screenshots/route-ledger-view-implementation.png`
  - `docs/design/screenshots/route-ledger-view-empty.png`
- Comparison evidence:
  - `docs/design/screenshots/route-ledger-view-main-comparison.png`
  - `docs/design/screenshots/route-ledger-view-states-comparison.png`
  - `docs/design/screenshots/route-ledger-view-header-comparison.png`
- Viewport: `1718 × 917` CSS px, `deviceScaleFactor: 1`
- Pixel dimensions:
  - Main source: `1715 × 917`
  - Result-state source: `1719 × 915`
  - Implementation: `1718 × 917`
- Density normalization: source and implementation均按 1x 像素密度直接并排；3px / 2px 的源图尺寸差异不缩放，不影响版式判断。
- States:
  - 主结果态：同日两团、每团独立日报、首团拼出 Popover 展开。
  - 空查询态：路线和出团日期均未选择。

## Findings

无可执行的 P0 / P1 / P2 差异。

- 字体与层级：沿用项目系统字体、14px 正文、16px 日报标题及 600 字重；标题、团号、次级团名和金额层级与设计一致。
- 间距与布局：Tabs 与筛选位于同一白色工作面；同日多团按独立日报上下排列；日报右侧拼出汇总、表格密度、合计行和浮层锚点与设计一致。
- 颜色与 Token：使用 Ant Design v6 语义色、边框、表面和浮层阴影；未新增业务裸色或自定义阴影。
- 图片与图标：该界面没有需要生成的业务图片资产；空态、日期和按钮图标均使用 Ant Design 官方组件或现有图标库。
- 文案与内容：筛选、校验、加载、无匹配、失败、无客源单和拼出明细文案均覆盖；浏览器截图中的“本日拼出”来自真实接口数据，设计稿中的“乌镇西栅拼出服务”为示例数据。
- 可访问性与交互：Tabs、筛选、团号链接、客源行跳转、拼出明细点击展开、重试与返回入口均保留语义化交互。

## Comparison history

### Iteration 1

- [P2] 团号链接继承列表链接的 `display: block`，导致日报标题换行。
- [P2] 固定数值横向滚动宽度使宽屏表格右侧出现空白，列密度偏离设计。
- [P2] 空查询结果独立落在灰色页面，未与 Tabs / 筛选形成一个工作面。
- [P2] 拼出 Popover 宽度偏大，日报标题区高度偏紧。

Fixes:

- 为日报团号增加行内显示覆盖，标题保持单行。
- Table 改用自适应横向滚动并补齐备注列宽。
- 非结果状态合并进筛选工作面；有结果时仍保持一团一表。
- Popover 内容宽度收敛至 368px，日报头部最小高度调整为 104px。

Post-fix evidence:

- `docs/design/screenshots/route-ledger-view-main-comparison.png`
- `docs/design/screenshots/route-ledger-view-states-comparison.png`
- `docs/design/screenshots/route-ledger-view-header-comparison.png`

## Browser verification

- Tested: 线路视图直达、真实同日多团数据、拼出明细展开、空查询态。
- Console errors: none.
- Ant Design lint: no deprecated, accessibility, usage, or performance findings in changed component files.

## Follow-up polish

- [P3] 设计稿未包含现有应用顶栏，真实页面保留项目壳层；这是既有产品结构，不作为实现偏差。
- [P3] “新建发团”按当前登录角色权限显示；QA 账号无该权限，因此实现截图中未显示主按钮。

final result: passed

---

# Design QA — WF-04 客源单与游客

## Evidence

- Source visual truth: `docs/design/wireframes/wf-01-business-collaboration-workspace.png`（1487 × 1058）
- Before fix: `docs/design/prototypes/wf-03-create-departure/wf-04-implementation.png`（1440 × 900）
- Before fix comparison: `docs/design/prototypes/wf-03-create-departure/wf-04-comparison.png`（2880 × 900）
- After fix: Codex In-app Browser 当前页面截图与无障碍树
- CSS viewport / density: 1440 × 900 / 1×；源图按高度缩放并居中填充到 1440 × 900 后同屏比较
- State: 客源单提案 v2 待审核

## Full-view comparison

三栏结构、对象—会话—产物上下文、审核内容层级与固定底部操作均保持基线关系。对象、会话和产物分别由其所在栏表达，中栏不再增加关系条或进度式顶栏。

## Focused regions

右侧审核面单独检查了判断区、金额摘要、名单表格和固定 footer；信息可读且滚动边界正确。中栏单独检查了附件、产物卡片和输入区；无重复确认操作。

## Findings

- 无剩余 P0/P1/P2。

## Comparison history

- Pass 1：发现 P1——中栏顶部关系条重复表达三栏关系并压缩会话工作面。
- Fix：删除关系条和全部对应 CSS；同步修正 ADR、需求文档、交互模型与 `CONTEXT.md`，避免后续原型再次引入。
- Pass 2：中栏标题后直接进入会话内容，三栏边界和顶部对齐恢复，无剩余 P0/P1/P2。

## Interaction and runtime checks

- 已测试：相关会话切换、精确编辑、保存回审与版本递增、确认写入、正式客源列表承接。
- `npm run build`：通过。
- `npm run test:sites`：4/4 通过。
- 浏览器页面可正常渲染；未观察到应用脚本错误。Headless Chrome 仅报告 macOS 无头显示环境日志，不影响页面运行。

final result: passed


## WF-05 日程资源（2026-09-05）

交互原型 QA：passed。已验证独立资源组分批确认、冲突阻断、局部材料修订、精确编辑、结果态及正式资源列表承接。构建与 5 项检查通过。详细范围与限制见 `docs/design/prototypes/wf-03-create-departure/wf-05-design-qa.md`。

### 原型串联导航复核（2026-09-05）

构建通过，现有 5 项检查通过。In-app Browser 验证资源左栏进入客源、客源左栏返回资源、浏览器返回与顶部创建发团入口；返回资源后已勾选酒店及巴士 v2 保留。已在创建结果、客源记录、资源记录加入跨页面入口；财务及尚未制作的关西概览明确禁用。刷新仍重置内存状态。

## 业务与 Agent 融合调整（2026-09-05）

移除原型切换导航，业务列表作为起点。已浏览器验证建团→客源→资源写入→手工新增→财务查询的共同数据与会话连续性。详细验证与限制见 `docs/design/prototypes/wf-03-create-departure/business-integration-qa.md`；此前独立原型导航记录已被本轮替代。
