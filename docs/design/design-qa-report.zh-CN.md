# apps/web Design QA 报告

## 结论

新版 `DESIGN.md` 已在主题、应用壳、标准页面骨架、复杂业务工作区与登录页例外中一致落实。代表页面最终判定全部通过：**P0 = 0、P1 = 0、P2 = 0、P3 = 0**。

QA 使用真实 Chrome、真实本地 API 与 seed 数据完成。修改前页面来自基线提交 `5d322da88587b804274a9932a749ed39281216f5`（独立只读 worktree，5174 端口），修改后页面来自本分支（5173 端口）；两者连接同一只读浏览数据。除登录更新时间外，没有提交表单或确认危险操作。

## 环境与视口

- Chrome 150，Ant Design 6.5.0，Vite 6.4.3。
- API：`http://localhost:3000/api`；Web：修改前 `http://127.0.0.1:5174`，修改后 `http://127.0.0.1:5173`。
- 视口：1440 × 900、1280 × 800、1024 × 768、390 × 844。
- 账号：seed 企业管理员；详情数据使用真实 Supplier、Departure、收付款节点与流水。

## 页面证据与最终判定

| 场景 | 视口 | 修改前 | 修改后 | 发现与修复 | 判定 |
|---|---:|---|---|---|---|
| 登录页 | 1440×900、390×844 | [桌面](screenshots/before/login-1440x900.png) / [移动](screenshots/before/login-390x844.png) | [桌面](screenshots/after/login-1440x900.png) / [移动](screenshots/after/login-390x844.png) | 裸色、宽阴影、圆角与对比度漂移；改用主题变量、细边框和 AA 主操作，对移动端无横向溢出 | 通过 |
| 工作台 | 1440×900 | [修改前](screenshots/before/home-1440x900.png) | [修改后](screenshots/after/home-1440x900.png) | 页面标题由 level 3 收敛到标准 level 4；统计、健康 Loading/Error/Success 保留 | 通过 |
| 员工管理 | 1440×900、390×844 | [桌面](screenshots/before/employees-1440x900.png) / [移动](screenshots/before/employees-390x844.png) | [桌面](screenshots/after/employees-1440x900.png) / [移动](screenshots/after/employees-390x844.png) | 统一页头与唯一主操作；390px 主操作 44px、表格横向滚动、壳自动折叠 | 通过 |
| 合作伙伴列表 | 1280×800 | [修改前](screenshots/before/partners-1280x800.png) | [修改后](screenshots/after/partners-1280x800.png) | 统一页头、筛选与表格骨架；高密度列保留横向滚动 | 通过 |
| 供应商详情 | 1280×800 | [修改前](screenshots/before/supplier-detail-1280x800.png) | [修改后](screenshots/after/supplier-detail-1280x800.png) | 增加副文案、统一分区标题和 Descriptions 响应列；最终控制台无警告 | 通过 |
| 发团详情·执行安排 | 1024×768、390×844 | [修改前](screenshots/before/departure-execution-1024x768.png) | [桌面](screenshots/after/departure-execution-1024x768.png) / [移动](screenshots/after/departure-execution-390x844.png) | 双栏在窄屏改为上下结构；金额右对齐；Tabs 可滚动，业务状态继续含中文文字 | 通过 |
| 收支流水 | 1024×768 | [修改前](screenshots/before/transactions-1024x768.png) | [修改后](screenshots/after/transactions-1024x768.png) | 主操作移至统一页头，筛选不重复，表格保留扫描顺序和横向滚动 | 通过 |
| 应收节点工作区 | 390×844 | [修改前](screenshots/before/receivables-390x844.png) | [修改后](screenshots/after/receivables-390x844.png) | 筛选换行、金额右对齐；Drawer 增加 Skeleton/Error/Retry/Empty，危险后果常显 | 通过 |
| 员工 Drawer | 390×844 | 基线同员工页 | [修改后](screenshots/after/employee-drawer-390x844.png) | Drawer 占满可用宽度，footer 取消在前、唯一主操作在后，两按钮 44px | 通过 |
| 停用员工危险 Modal | 390×844 | 基线同员工页 | [修改后](screenshots/after/danger-modal-390x844.png) | 明确对象、不可登录后果与可恢复路径；仅打开未确认 | 通过 |

## 逐项检查

| 轴 | 结果 | 证据摘要 |
|---|---|---|
| DESIGN.md 符合度 | 通过 | Token 入口唯一为 `AppProviders.tsx`；页面仅消费 antd Token/语义属性 |
| 页面层级/首要任务 | 通过 | 标准 PageHeader；每个页面/Drawer/Modal 决策面最多一个 primary |
| 颜色 | 通过 | 业务页无新增裸色；登录页可替换色已收敛；状态保留中文 label |
| 4px 网格 | 通过 | 壳 8/12/16/24，异常 -6px 已修正为 -8px |
| 圆角/阴影 | 通过 | 6px 控件、8px 容器；静态登录 Card 移除宽模糊阴影 |
| Card/工作面 | 通过 | Card 仅表达真实统计、筛选或主工作区；未新增嵌套卡片墙 |
| Table | 通过 | 分页总数/page size 保留；金额右对齐；窄屏横向滚动 |
| Hover/Focus/Disabled | 通过 | antd 状态保留；壳按钮具 aria-label；移动触控目标 ≥44px |
| Loading/Empty/Error | 通过 | 工作台健康态、Table loading；财务详情 Skeleton/Error+Retry/Empty |
| Drawer/Modal | 通过 | 常规 480px、复杂 520/960px，统一 `min(目标宽度, 100vw)`；无溢出 |
| 键盘与焦点 | 通过 | 登录顺序合理；核销 radio 支持键盘；危险 Modal 初始焦点落在危险操作 |
| 对比度 | 通过 | 登录页 Lighthouse Accessibility 100；正文/状态使用规范墨色与语义色 |
| 控制台 | 通过 | 最终抽查无 error/warning；供应商 Descriptions span 警告已消除 |

## 发现与修复记录

| ID | 严重度 | 问题 | 修复 | 状态 |
|---|---|---|---|---|
| Q01 | P1 | 移动端固定侧栏压缩内容 | 断点自动折叠，展开时固定覆盖；Header 操作 44px | 已修复 |
| Q02 | P1 | 标准页页头与主操作位置漂移 | 提炼轻量 `PageHeader` 并保持唯一主操作 | 已修复 |
| Q03 | P1 | 执行安排固定双栏和 JS 高度造成窄屏溢出 | <768px 切换上下结构，取消强制高度 | 已修复 |
| Q04 | P1 | 财务 Drawer 非理想态和窄屏宽度不完整 | 响应式宽度、Skeleton、Alert+重试、Empty | 已修复 |
| Q05 | P1 | 登录页裸色、静态宽阴影与主按钮对比不足 | Token 化、细边框、AA 深色主操作 | 已修复 |
| Q06 | P2 | 供应商 Descriptions 响应 span 产生 antd 控制台警告 | 长字段使用 `span="filled"` | 已修复 |

## 可访问性与控制台

- 登录页最终 Lighthouse：Accessibility 100、Best Practices 100。报告位于 `docs/design/lighthouse-login/`。
- SEO/Agentic Browsing 的 `meta description`、`robots.txt`、`llms.txt` 不属于已认证 B 端样式重构范围，不计为 Design QA 缺陷。
- 键盘抽查覆盖登录表单、员工 Drawer、核销候选 radio 与危险确认 Modal。

## 严重度汇总

| 严重度 | 发现 | 已修复 | 遗留 |
|---|---:|---:|---:|
| P0 | 0 | 0 | 0 |
| P1 | 5 | 5 | 0 |
| P2 | 1 | 1 | 0 |
| P3 | 0 | 0 | 0 |

## 已知问题与非目标

- Vite build 仍提示单个 JS chunk 大于 500kB；这是既有性能/拆包事项，不影响本次视觉一致性与核心任务，未在样式重构中扩大范围。
- jsdom 测试打印 `getComputedStyle(..., pseudo-element)` 未实现提示，但 38 个测试文件、126 项测试全部通过；这是测试环境能力提示，不是浏览器运行警告。
- 组织管理与角色权限尚为占位业务页，不在本次代表页重构范围；应用壳 Token 已覆盖其基础工作面。

## 最终判定

完成标准满足：P0 = 0、P1 = 0、所有代表页面通过、P2 无遗留；没有通过放宽 `DESIGN.md` 或仅更新截图关闭问题。
