## UI audit — `/finance/receivable`

**Branch:** audit-and-fix  
**Files:** `ReceivablesPage.tsx`、`PaymentScheduleWorkspace.tsx`、`PaymentScheduleFilters.tsx`、`PaymentScheduleTable.tsx`、`payment-schedule-table-columns.tsx`、`PaymentScheduleDetailDrawer.tsx`、`PaymentScheduleActionDialogs.tsx`、`RegisterSettlementDrawer.tsx`、`CreateVerificationDrawer.tsx`、`EditScheduleDrawer.tsx`、`CancelScheduleModal.tsx`、`ReopenScheduleModal.tsx`、`AdjustAmountModal.tsx`

### Findings

| ID | Sev | Locus | Symptom | DESIGN | Catalog fix |
|----|-----|-------|---------|--------|-------------|
| F1 | P1 | `PaymentScheduleFilters.tsx` | 固定宽度筛选控件在 390px 工作区可能横向溢出 | 响应式结构变化，筛选换行且移动端可操作 | A6：保留桌面宽度并增加容器/控件最大宽度 |
| F2 | P1 | `PaymentScheduleDetailDrawer.tsx`、各编辑 Drawer | 480–960px 固定 Drawer 未明确约束到视口宽度 | 小于 768px 时 Drawer 优先占满可用宽度 | A8：Drawer 宽度使用 `min(设计宽度, 100vw)` |
| F3 | P0 | `PaymentScheduleDetailDrawer.tsx` | 查询失败与“节点不存在”无法区分，用户没有可执行恢复动作 | 失败优先页内 Alert；空态解释原因并给下一步 | A10：错误 Alert + 重试；加载使用 Drawer Skeleton |
| F4 | P1 | `payment-schedule-table-columns.tsx`、`CreateVerificationDrawer.tsx` | 同组金额列未右对齐，纵向比较不稳定 | 金额右对齐，保留货币符号与单位 | A9：金额列统一 `align: right` |
| F5 | P0 | `CancelScheduleModal.tsx` | 无核销记录时危险确认不显示后果说明；提交中仍可关闭确认框 | 破坏性操作说明对象与后果；loading 防止重复操作 | A12/A10：始终显示 Warning，并锁定提交中取消路径 |
| F6 | P1 | `CreateVerificationDrawer.tsx` | 候选表格仅整行点击，没有可聚焦的标准选择控件 | 主要流程可用键盘完成，不重造标准交互 | A10：使用 Table 单选 `rowSelection`，保留整行点击 |
| F7 | P2 | Drawer footer | 使用 float 右对齐，窄屏下 footer 布局语义不稳定 | 取消在前、唯一主按钮在后 | A8：改为全宽 Flex 末端对齐 |

### Catalog axes

- A1：pass；页面、Drawer、Modal 各决策面均只有一个 primary。
- A2：pass；未新增裸颜色，定位高亮继续消费 antd token 注入值。
- A3：pass；preset 色仅用于 Tag 分类/状态。
- A4：pass；页面保持标准页头、筛选 Card、表格 Card、Drawer/Modal 骨架。
- A5：pass；页头由统一 `PageHeader` 提供标题阶梯。
- A6：F1。
- A7：pass；无新增阴影、异常圆角或自定义装饰动效。
- A8：F2、F7。
- A9：F4；分页已显示总数并允许切换 page size，表格支持横向滚动。
- A10：F3、F5、F6。
- A11：pass；阻断反馈使用 Alert/Modal，Tag 仅承载状态。
- A12：F5；关闭节点使用危险 Modal，调整/重新打开均说明业务影响。
- A13：pass；仅保留筛选与主表两个真实工作面，无嵌套 Card 墙。
- A14：pass；沿用 `CONTEXT.md` 的应收、应付、收付款节点与核销术语。

### Waives

- 详情 Drawer 为连续上下文查看，不要求编辑 footer。
- 核销 Drawer 属于高密度复杂流程，允许 960px 桌面宽度；窄屏改为视口宽度并依赖表格横向滚动。
- 同构组件同时服务 `/finance/payable`，本次修复自然复用于应付页面，不扩展至其他业务域。

### Fixes applied

- F1 → 筛选容器全宽并为固定宽控件增加 `maxWidth: 100%`。
- F2 → 四类 Drawer 使用视口受限宽度；三列/两列 Form Row 在窄屏变为单列。
- F3 → 详情加载使用 Drawer Skeleton；错误显示 Alert 与“重试”，空数据单独显示 Empty。
- F4 → 工作区及核销候选表金额列统一右对齐。
- F5 → 关闭节点始终显示具体后果，mutation pending 时禁用取消、关闭、Esc 与遮罩关闭。
- F6 → 两张候选表增加可聚焦的 radio 选择列。
- F7 → Drawer footer 改为全宽 Flex 右对齐，顺序保持“取消 → 主操作”。

### Left as P2 / skipped

- 无。
