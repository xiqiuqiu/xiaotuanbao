# 登录页 Design QA

- source visual truth path: `apps/web/public/login-concept-travel-plane-v4.png`
- implementation screenshot path: `login-implementation-qa-final.png`
- comparison evidence: `login-qa-comparison-final.jpg`
- mobile evidence: `login-implementation-mobile.png`
- narrow-desktop regression evidence: `login-bugfix-current-viewport.png`
- boundary evidence: `login-bugfix-720.png`、`login-bugfix-820.png`、`login-bugfix-960.png`
- viewport: desktop 1280 × 720；窄桌面 906 × 859；边界 720 / 820 / 960；mobile 390 × 844
- state: 登录初始态；空表单校验；记住账号；忘记密码提示

## Full-view comparison evidence

最终并排证据显示：实现保留参考稿的浅色双栏构图、左侧品牌与能力层级、旅游业务流程插画、右侧白色登录卡片、主按钮与安全提示。按用户要求，参考稿中的「使用企业账号继续」与底部「查看演示账号」未实现。

## Focused region comparison evidence

- 登录卡片：标题、字段、密码显隐、记住账号、忘记密码、主按钮、安全提示均与目标结构一致；两个指定删除项不存在。
- 左侧视觉：使用独立生成并裁切适配的旅游运营插画，飞机、出发地、行程计划、地接服务、酒店资源、供应商资源与结算对账均完整可见，无截断。
- 移动端：390 × 844 无水平滚动，主登录操作在首屏可见，其余内容可纵向滚动。

## Findings

无未解决的 P0 / P1 / P2 问题。

## Comparison history

1. 首轮：插画来自参考稿裁切，酒店节点被截断，背景出现硬边；替换为独立生成的完整旅游运营插画。
2. 第二轮：独立插画顶部留白覆盖能力说明，桌面端 1280 × 720 出现纵向滚动；重新裁切素材并增加矮视口紧凑规则。
3. 最终轮：桌面端 `scrollHeight === innerHeight`，无水平或纵向溢出；移动端无水平溢出；控制台无 warning / error。
4. 回归修复轮：用户在 906 × 859 窄桌面视口发现页面被 960px 断点错误堆叠，且 RGB 素材暴露矩形底色。将单列断点收紧至 720px，为 721–960px 增加紧凑双栏布局，并将品牌图与旅游插画替换为具备 Alpha 通道的透明 PNG。
5. 回归复验：906、820、960 宽度保持双栏且无横纵溢出；720 宽度按设计进入单列；透明素材与页面底色无矩形接缝。

## Interaction verification

- 空表单提交展示「请输入用户名」「请输入密码」。
- 「记住账号」复选框可切换。
- 「忘记密码？」展示「请联系企业管理员重置密码」。
- 密码显隐按钮可用。
- 浏览器控制台：0 warning，0 error。
- 自动回归门槛：`python3 scripts/check_login_visual_regression.py`，覆盖中间断点与两张素材的 Alpha 通道。

## Follow-up Polish

- P3：若后续有正式品牌源文件，可替换当前从视觉稿提取的品牌锁定图，进一步提升高 DPI 清晰度。

final result: passed

---

# 核销详情 Design QA

- source visual truth path: `docs/design/screenshots/verification-detail-reference.png`
- implementation screenshot path: `docs/design/screenshots/verification-detail-1328x1216-v2.png`
- comparison evidence: `docs/design/screenshots/verification-detail-comparison.png`
- mobile evidence: `docs/design/screenshots/verification-detail-390x844.png`
- viewport: desktop 1328 × 1216；mobile 390 × 844
- state: 核销管理列表打开 `CLXTB202607000004` 详情抽屉

## Full-view comparison evidence

最终并排证据显示：抽屉左边界、940px 桌面宽度、标题栏、概览双列、金额摘要、三段核销链路、流水双列、收付款节点双列与底部关闭操作均与视觉稿一致。背景应用壳保留项目现状，不属于本次详情抽屉改造范围。

## Focused region comparison evidence

- 字体与排版：继续使用项目系统字体与 `DESIGN.md` 的 20px 抽屉标题、16px 分区标题、14px 正文层级；金额使用 600 字重与等宽数字特性。
- 间距与布局：正文横向 32px、纵向 24px；分区以 24px 分隔线组织；详情不嵌套卡片墙。
- 颜色与 Token：全部来自 antd Token 与既有 catalog；品牌蓝只用于链接、复制和链路重点，状态同时保留中文文本。
- 图像与图标：视觉稿没有业务位图资产；关闭、复制、链路箭头均使用既有 Ant Design 图标库，无手绘 SVG、CSS 图形或占位素材。
- 文案与内容：仅复用现有核销、流水、收付款节点 API 字段，没有新增操作、数据或接口。

## Findings

无未解决的 P0 / P1 / P2 问题。

## Comparison history

1. 首轮：抽屉沿用 680px，链路编号与关联发团发生明显换行，且与视觉稿左边界不一致（P1）。调整为 `min(940px, 100vw)`，桌面视口与视觉稿对齐。
2. 第二轮：390px 窄屏下概览仍固定两列，核销单号和创建时间被挤压换行（P2）。改为 `<576px` 单列，复验无水平溢出。
3. 最终轮：桌面并排证据无可执行 P0 / P1 / P2；移动端抽屉占满可用宽度、链路纵向堆叠、底部关闭按钮可触达。

## Interaction verification

- 点击核销单号可打开详情抽屉。
- 底部「关闭」可关闭详情抽屉。
- 加载错误、重试与关闭交互继续由现有组件测试覆盖。
- 新浏览器页控制台：0 warning，0 error。

## Follow-up Polish

- 无阻塞项；视觉稿的字号与项目 `DESIGN.md` 有轻微比例差异，按项目唯一视觉规范保留现有字体阶梯。

final result: passed
