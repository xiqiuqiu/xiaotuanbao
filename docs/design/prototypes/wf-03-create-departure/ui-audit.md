# UI audit — WF-03 创建发团原型

> 历史验证记录：本文及关联截图只证明当时版本，不能作为当前业务校验或验收规则。最新设计以 [#483](../../../prd/2026-09-07-business-object-agent-collaboration.md) 和 [本轮对齐记录](current-design-qa.md) 为准；年龄/电话类型强制核实、容量阻断、全局聊天及原收款简化已失效。

**Branch:** audit-and-fix
**Files:** `src/App.jsx`、`src/styles.css`
**Evidence:** `audit-ui-before.png`

## Findings

| ID | Sev | Locus | Symptom | DESIGN | Catalog fix |
| --- | --- | --- | --- | --- | --- |
| F1 | P1 | `App.jsx` · `PhaseRail` | WF-02 评审状态轨进入了业务页面，形成额外导航层 | 主工作区只保留一种主结构 | A13 删除额外页面表面 |
| F2 | P1 | `App.jsx` · `relationStrip` | 工作范围、来源会话、当前产物分别已在三栏可见，关系卡重复信息且压缩会话 | 避免无业务意义的嵌套 Card | A13 删除重复容器 |
| F3 | P1 | `styles.css` · `.conversationList` | 标题与列表左右基线不稳，时间在窄栏换成两行 | 4px 网格、列表可扫描 | A6 统一 16/8/12 间距并固定时间宽度 |
| F4 | P1 | `App.jsx` · 完成态 | 发团已创建后，页头和左栏仍显示“待创建 / 草稿”，状态事实冲突 | 成功状态必须明确且一致 | A10/A14 更新正式对象语义 |
| F5 | P2 | `App.jsx` · pane header | 中栏状态 Tag 与右栏产物状态重复；完成后仍显示“退出审核” | 标题不抢任务、文案符合状态 | A5/A14 收敛重复状态与失效操作 |
| F6 | P1 | `App.jsx` · `activeConversation` | 切换会话只改变左栏选中态，中栏内容没有变化 | 可见主控件必须反馈真实状态变化 | UX：让会话标题与内容同步 |
| F7 | P1 | `styles.css` · 页面骨架 | 顶栏 68px、分栏标题 50px 偏离现有 64/48px 骨架 | Header 64px、4px 网格 | A6 对齐 64/48px |

## Catalog axes

| Axis | Result |
| --- | --- |
| A1 Single primary | pass |
| A2 Token color | waive：原型位于 `docs/`，生产实现仍须使用 `AppProviders` token |
| A3 Functional vs preset | pass |
| A4 List skeleton | waive：非标准列表页 |
| A5 Title ladder | F5 |
| A6 4px grid | F3、F7；其余原型细节不在本轮扩散修改 |
| A7 Radius / elevation / motion | pass |
| A8 Form chrome | pass |
| A9 Table chrome | waive：无表格 |
| A10 State certainty | F4 |
| A11 Tag vs Alert | pass |
| A12 Destructive | pass |
| A13 Surfaces | F1、F2 |
| A14 Copy | F4、F5 |

## Waives

- 顶部品牌标记和本地 CSS 色值仅用于独立交互原型，不作为 `apps/web` 生产实现依据。
- WF-02 状态切换能力仍由完整交互路径覆盖，不在业务页面保留评审控件。

## Fixes applied

- F1：删除顶部 WF-02 评审状态轨，状态仅由真实操作推进。
- F2：删除中栏重复关系卡，三栏本身承担对象、会话和产物关系。
- F3：统一会话区 16px 内边距、8px 行间距、12px 行内边距；标题截断，时间禁止换行。
- F4：创建完成后，页头与左栏同步显示正式对象和“已创建”。
- F5：移除中栏重复状态 Tag；完成态移除“退出审核”。
- F6：切换会话会同步更新中栏消息内容。
- F7：顶栏与分栏标题分别收敛为 64px / 48px。

## Left as P2 / skipped

- 无。

## Follow-up audit

- `P1`：原型状态不可通过真实动作连续到达；已改为从确认范围开始并自动进入 Agent 执行与最小追问。
- `P1`：Precision Edit 仍为覆盖式 Drawer；已改为右侧一级状态，并保留保存返回审核与重新校验反馈。
- `P1`：会话补充和审核重复判断同一联系电话；已拆为“补齐事实”和“确认业务影响”两种职责。
- `P1`：退出审核、会话发送和正式记录入口无反馈；已补齐暂存/恢复、消息追加和正式发团概览。
- `P2`：低高度视口下主操作不可见；已固定工作区高度并让内容独立滚动。
