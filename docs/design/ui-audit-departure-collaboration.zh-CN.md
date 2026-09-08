# UI audit — 发团协作工作区

日期：2026-09-07。分支：audit-and-fix。规范：根目录 DESIGN.md 与 ui-audit/catalog.md。

## 范围

唯一入口 `/departure/:departureId` → 业务侧栏 → 展开协作工作区。覆盖客源单、执行资源审核及确认结果；不改业务规则、不审计其他业务页面。

文件集（路径均相对 apps/web/src）：
- features/agent-conversation/DepartureCollaborationWorkspace.tsx、同名 module.css
- features/agent-conversation/SegmentResourceReviewPanel.tsx、同名 module.css
- features/ai-assist/SourceOrderReviewPanel.tsx、同名 module.css、SourceOrderReviewField.tsx
- features/departure/components/DepartureSourceOrderReview.tsx
- features/agent-conversation/AgentConversationChat.tsx：审核 activity renderer；features/ai-assist/AiCreateAssistChat.module.css：审核卡片
- layouts/AssistPane.tsx、同名 module.css：发团侧栏页头
- features/departure/components/SourceOrderDrawer.tsx：复用的 FareAdjustmentsEditor 及行组件

## Findings（修改前记录）

| ID | 等级 | 位置 | 症状 | DESIGN 条款 | Catalog |
|---|---|---|---|---|---|
| F1 | P1 | Workspace/categories | 导航选中是实心 primary，与确认动作争抢强调 | Navigation、唯一主操作 | A1/A3 |
| F2 | P1 | Workspace/queries 与 empty | 初始化显示空态，发团失败仍显示加载；筛选为空误导为无审核；重试反馈不统一 | Feedback | A10 |
| F3 | P1 | Workspace.css/media | 窄屏仍最小 840px 三栏；实测 500px 视口审核栏起点 x=500，不可直接操作 | 响应式结构、44px | A4/A8 |
| F4 | P1 | Workspace/review snapshot；Resource/.panel | 客源结果字段挤在一起、资源重复内缩；标题默认 700 | Typography、详情分区 | A5/A6/A13 |
| F5 | P1 | SourcePanel/footer、editing | 保存/取消顺序倒置，确认靠左；需要核对长内容吸底 | Drawer footer | A8 |
| F6 | P1 | SourceReview/onError；Resource/patchField | 保存错误仅 toast；资源结果没有与客源一致的成功提示 | Feedback、字段错误 | A10/A11 |
| F7 | P1 | Resource/supplier Select | 已选供应商不在搜索首屏时可能显示内部 ID；查询无失败提示 | 状态确定、字段可理解 | A10 |
| F8 | P1 | Chat/reviewActivityCard | 已确认卡片仍黄色警告背景 | Semantic | A2/A11 |
| F9 | P1 | Workspace.css；AssistPane/.paneHeader | 工作区重复颜色别名；业务侧栏页头依赖未继承的 assist-border | 唯一主题、表面边界 | A2/A13 |
| F10 | P2 | Workspace/itemTitle、history、heading | 客源名称显示 ID 后缀；长会话占据过高空间，截断标题无完整文本 | Typography、长文本 | A5/A14 |
| F11 | P2 | SourcePanel/AmountPreview；ReviewField/金额与列表 | 金额缺千分位、字段列表原生段落间距不一 | Number、4px 网格 | A5/A6 |
| F12 | P1 | SourcePanel/unsupported schema | 提示拒绝建议却没有该操作 | 可执行反馈 | A10/A14 |

| F13 | P1 | ReviewField/ReviewAdjustments 编辑态 | 500px 窄屏下金额 input 实测只有 4px 宽；编辑表格被压缩 | 金额完整、表格横向滚动 | A8/A9 |

| F14 | P1 | Workspace 与 ResourcePanel 的审核底部 | 资源材料依据入口重复；短表单确认栏未贴底，客源材料依据在确认栏之后 | 明确行动、吸底操作 | A8/A13 |

| F15 | P1 | ai-create-copilot-messages/isLiveClearedByTerminalBatch | 已进入待审核却仍展示工作动画，实时流未清理 | 状态确定 | A10 |

## 全轴检查

每个范围文件均按 A1–A14 检查；无对应元素记为不适用，不等于全站通过。

| 文件组 | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | A9 | A10 | A11 | A12 | A13 | A14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Workspace | F1 | F9 | F1 | F3/豁免 | F4/F10 | F4 | 通过 | F3 | 不适用 | F2 | F6 | 不适用 | F4/F9 | F10 |
| ResourcePanel | 通过 | 通过 | 不适用 | 豁免 | F4 | F4 | 通过 | F5 | 不适用 | F6/F7 | F6 | 豁免 | F4 | 通过 |
| SourcePanel/Field | 通过 | 通过 | 不适用 | 豁免 | F11 | F11 | 通过 | F5 | 豁免 | F12 | 通过 | 豁免 | 通过 | F12 |
| SourceReview wrapper | 通过 | 不适用 | 不适用 | 不适用 | 不适用 | 通过 | 不适用 | 不适用 | 不适用 | F6 | F6 | 不适用 | 通过 | 通过 |
| Chat 审核卡片 | 通过 | F8 | 通过 | 不适用 | 通过 | 通过 | 豁免 | 不适用 | 不适用 | 通过 | F8 | 不适用 | 通过 | 通过 |
| AssistPane 页头 | 通过 | F9 | 不适用 | 不适用 | 通过 | 通过 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | F9 | 通过 |
| FareAdjustmentsEditor | 通过 | 通过 | 不适用 | 不适用 | 通过 | 通过 | 通过 | 豁免 | 豁免 | 通过 | 通过 | 豁免 | 通过 | 通过 |

## Waives

- 已确认的三栏业务工作区及右栏组内修订，不改成标准列表或二次 Drawer。
- 聊天保留 CopilotChatView；不重建输入胶囊。只审审核卡片样式，不扩展到历史欢迎页动画。
- 费用调整是有限的表单行，不需要分页；窄列允许表格内部横向滚动。
- 移除客人/调整行仅改审核草稿；拒绝建议保留记录，不删除正式业务对象，免额外删除确认。
- 审核未生成前不展示写入操作；财务后续入口仍只出现在创建完成后。

## Fixes applied

- F1/F9：使用 antd 主题变量；左侧导航浅主色底与主色文字，确认区保持唯一主操作；补齐侧栏页头边界。
- F2/F12：初始化 Skeleton、失败 Alert 与重试、分类空态与首次协作空态分开，未知版本提供实际可执行的指引。
- F3：桌面三栏，低于 1024px 用 Segmented 切换分区；所有分区保持挂载，修订与聊天输入保留；窄屏关键操作至少 44px。
- F4/F10/F11：统一字段节奏、标题字重、结果间距与金额格式；长会话收敛两行并保留完整 title；事项不再显示内部 ID。
- F5/F13/F14：取消在前、主操作在后；短/长审核都吸底；编辑态金额可读，680px 表格只在自身容器内滚动；删除重复材料入口。
- F6/F7：保存/确认错误页内反馈；缺失资源字段列出字段名并高亮；供应商保留已选名称，加载失败可重试；资源成功用语义 Alert。
- F8：已确认消息回归中性卡片，保留中文成功状态；只有待审建议用警告色。
- F15：同一轮进入待审核即清除残留流式工作状态；其他轮的实时输出不受影响，有回归用例。
- 更新范围内旧 Select 搜索参数及 InputNumber 后缀用法，antd lint 无问题。

## Leftovers / 验收范围

本次发现的 P1 与上述 P2 已处理，未留阻断项。保留前述框架及业务结构豁免。

### 实际浏览器验收

本地 QA 发团：`cmtral59g0003wdobwgyhkh4t`，演示管理员。检查真实服务返回的审核数据，没有用静态 mock 页面代替。

| 场景 | 结果与证据 |
|---|---|
| 1440 × 900 桌面 | 三栏无横向溢出；当前审核只有一个 primary；资源和客源确认按钮 y=840、底边872 |
| 客源长内容滚动 | scrollTop=0、400、795 时，确认按钮 y=840、840、839.85，左侧始终 y=0 |
| 1024 × 768 | 三栏可用，资源确认按钮底边740，未出屏 |
| 500 × 844 窄屏 | 工作区 scrollWidth=500；当前分区完整展示，确认按钮44px高，底边816 |
| 团款调整编辑 | 修复前金额 input=4px；修复后80px；内部容器436px、内容680px，可横向查看和编辑 |
| 编辑中切换分区 | 切去会话再返回，调整行200.00与编辑状态保留，未保存时确认禁用 |
| 清空资源总价 | 显示缺失提示、确认禁用；恢复800.00后恢复可审核，仍未确认写入 |
| 待审与结果切换 | 左侧对象结构不变；结果显示正式记录入口，后续应收在创建成功后才出现 |
| 分类空态 | 财务分类无项时提示其他分类已有事项，提供“查看全部事项” |
| 新建协作空态 | 明确引导提供材料，没有提前出现写入按钮 |
| 刷新恢复 | 仍选中“客源管理 · 第2项 · 待审核”，不重新创建审核包 |
| 运行状态 | 待审核时工作动画数量0，不再与等待审核状态矛盾 |

此轮只新增了本地 QA 待审材料并修订候选总价；没有确认新增正式客源/资源，没有提交应收或应付。

### 自动检查

- `pnpm typecheck` 通过。
- 相关前端回归：13 个文件、128 个测试通过，覆盖分区选择/空态/错误、客源和资源修订、会话状态投影。
- React Doctor changed：82/100，与修改前82持平；未通过压制规则提高得分。
- 范围内修改的 antd 组件 lint 通过；`git diff --check` 通过。
- 设计专项扫描补充意见见下方。

### 交付边界

这是发团 Agent 协作入口的本地视觉验收，不是全 SaaS 全站验收。网络失败/重试以组件测试验证，未在浏览器注入断网；未覆盖全权限角色、暗色主题、真机移动端、生产发布。浏览器工具实际最小视口为500px，本轮不声称390px真机通过。截图已在审查过程中逐屏查看；截图落盘因浏览器工具的工作区路径限制未能完成。代码未提交或推送。

设计扫描补充：FareAdjustmentViewRow 的数字列已使用 tabular-nums，扫描器未识别内联合并样式，按源码豁免；SourceOrderGuestRosterSection 的大样式对象不在本次工作区范围。

F15 扩展文件：ai-create-copilot-messages.ts 的当前轮状态投影（A10）；无新增控件，其余 A1–A14 不适用。

## Impeccable 视觉细化复验（2026-09-07）

- 保持 Ant Design 组件与 CopilotKit 会话结构、三栏布局、独立滚动和确认按钮吸底。
- 客源审核与结果的人数、单价成对排列，客户、备注和名单占整行；窄容器回到单列。组内编辑沿用同一布局。
- 团款摘要改为四项核算明细，突出结算金额；减轻折叠组灰底，统一审核标题层级及间距。
- 业务对象侧栏采用浅底，业务卡片保留白底。修正工作区次要文字与输入占位文字的实际颜色：从 #8c8c8c 改为设计 token 对应的 #595959。
- 1440×900 与 500×844 实际浏览器截图逐屏检查；两者页面无横向溢出。窄屏报价编辑控件完整，编辑时确认禁用，取消恢复；桌面确认按钮底边872，仍在视口内。
- 本轮仅新增一份本地 QA 待审材料，未确认创建正式记录。已恢复桌面视口。

检查：相关组件2个文件10个测试通过；`pnpm typecheck` 通过；React Doctor changed 82/100，基线未回退；客源审核 antd lint 与 `git diff --check` 通过。

**复验更正：F15 尚未完整解决。** 新一轮生成客源审核后，可再次观察到“等待表单审核”与“Agent 正在工作”动画并存。此前表格中的运行状态通过仅代表当时场景，不能视为该问题完全关闭；本轮视觉排版修改未处理该状态同步问题。其余交付边界沿用上文。
