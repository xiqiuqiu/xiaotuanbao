# Agent 协作工作区交付审查（2026-09-08）

Branch: audit-and-fix。范围：DepartureCollaborationWorkspace 入口，AgentConversationChat/共用 CopilotKit 工作指示器，SourceOrderReviewPanel/Field、DepartureSourceOrderReview、SegmentResourceReviewPanel 及其 CSS；复用 AssistPane 与 AiCreateAssistChat 的壳层只检查关联影响。保留已确认的三栏、左侧对象稳定、独立滚动、材料驱动和创建后应收入口。

依据：DESIGN.md、ui-audit A1–A14、Impeccable audit/harden/craft-floor。Google 内部验收规则不可访问，本报告不作其内部认证声明。

## 首轮问题

| ID | 严重度 | 位置 | 影响 | 依据/修复 |
|---|---|---|---|---|
| G1 | P0 | AgentReasoningMessage / CopilotKit MemoizedReasoningMessage | 父级已停止，缓存子消息仍显示工作动画，结果状态自相矛盾 | A10；让指示器读取受控会话的最新运行状态，覆盖两个调用入口 |
| G2 | P1 | SourceOrderReviewField.ReviewPartner | 搜索/已选客户加载失败没有重试，编辑时可能显示内部 ID | A10；页内错误、重试和明确加载标签 |
| G3 | P1 | AgentConversationChat 输入与消息操作 | 附件按钮缺少名称、复制操作英文 | DESIGN Buttons；沿用 CopilotKit Slots/labels 补中文可访问名称 |
| G4 | P1 | 客源/资源审核只读状态 | 只有禁用按钮，缺少无权限解释；资源提交中仍能改字段 | A10；只读说明、提交中锁定编辑 |
| G5 | P2 | SourceOrderReviewPanel 结果 | 历史结果一直声称“尚未提交应收”，没有查询当前财务状态支持 | A10/A14；明确描述创建时未自动提交，而非断言当前状态 |
| G6 | P1 | ReviewBody / 固定操作栏 | 滚动定位的控件可能位于吸底栏后面 | DESIGN focus；预留滚动定位空间并用键盘复验 |
| G7 | P1 | agent-reasoning-message.module.css | 提示用裸色且取消焦点轮廓 | A2/A7；使用 antd token 和可见焦点 |

## 逐轴结论（覆盖上述文件集）

A1 pass：各审核只一个主操作，编辑时确认降级禁用。A2 finding G7，其余 token；A3 pass；A4 waive：专用协作详情采用已确认三栏，不套列表骨架；A5 pass：16px分区标题；A6 pass：主布局4px网格，框架内置间距豁免；A7 finding G7，CopilotKit聊天输入与品牌 Mascot 既有外形保留；A8 waive：审核包在专用审核区编辑，不再套 Drawer；A9 waive：无分页业务列表，调整表复用既有编辑器且内部横滚；A10 findings G1/G2/G4/G5；A11 pass：阻断问题使用 Alert；A12 pass：客人移除只作用草稿、可取消，资源拒绝不删除正式记录；A13 pass：工作面最多两层；A14 finding G3/G5。G6 补充键盘与响应式检查。

Impeccable 文件检测覆盖入口、资源审核、客源审核/字段和入口CSS，返回 []。不以该静态检测代替运行状态和浏览器审查。

## 验收记录

修复与复验待补充。首轮浏览器已实证 G1：CopilotChatView.isRunning=false，而 AgentReasoningMessage.isRunning=true，消息列表停留于 live-assistant。依赖1.67.1的 memo 比较仅在 reasoning 恰为最后一条消息时比较 isRunning，已核对实现。

补充 G8（P1，A10）：窄屏由已滚动的资源审核切到客源结果，共用滚动区保留旧位置，结果标题与成功提示被切到视口之外。切换事项或状态变化时应将审核区回到顶部，保留会话与对象区的位置。

## 修复与复验结果

G1–G8 已修复。没有新增组件库或替换 CopilotKit 聊天壳。

- G1：共用 AgentWorkContext 由两个受控会话入口提供最新 messages/isRunning；缓存消息内部读取 context，不通过重挂载整个会话解决。新增模拟缓存行不更新 props 的回归测试。待审及实际新一轮查询结束后工作指示器均为0。
- G2：已选客户始终显示业务名称或明确加载/错误提示，搜索失败可页内重试；测试验证失败→重试恢复。
- G3：附件按钮与复制操作已中文命名；实际浏览器当前可见无名称按钮数量0。
- G4：只读模式说明权限原因；资源确认过程中输入与拒绝动作禁用，新增回归测试。
- G5：客源/资源成功提示陈述创建时行为，保留到正式业务页处理后续财务的入口。
- G6：滚动容器设置上下定位留白。500×844键盘Tab到总价时输入底边751、确认按钮顶边772；再到备注时底边699，均不被操作栏遮住。
- G7：工作提示使用 Ant Design 颜色 token，键盘焦点可见。
- G8：事项切换或状态变化只将审核区 scrollTop 归零；实际资源滚动149后切换结果归零，桌面结果标题正常展示。会话和业务对象区不跟随重置。

### 浏览器覆盖

实际本地服务，QA发团 `cmtral59g0003wdobwgyhkh4t`，桌面1440×900、窄屏500×844；客源待审、资源待审、客源历史结果、财务分类空态、键盘Tab、切换分区、刷新恢复均检查。桌面scrollWidth1440、窄屏scrollWidth500。刷新仍选中“客源管理 · 第2项 · 已确认”，只有一个可见primary（继续提交应收）。本轮仅发出一次只读查询消息，没有创建正式业务记录、拒绝建议或提交财务。

### 自动检查

- 8个相关测试文件、78项测试通过（工作指示器、会话投影、客源、资源、工作区、侧栏和创建确认）。
- React Doctor changed 82/100，与先前82持平；10项提示，包含既有复杂度/大组件/列表key等。没有改配置或压制规则；客户错误分支增加了复杂度提示，不构成视觉不一致或阻断。
- 三个修改的 Ant Design 审核组件 lint 均0问题；文件检测首轮0项。类型检查与diff检查记录以最终命令结果为准。

### 质量评估及边界

本轮审查评分：无障碍3/4、性能3/4、响应式3/4、主题3/4、实现一致性4/4，共16/20。是本地有限范围评估，不是WCAG认证、Google内部认证或全站发布验收。没有用主观评分取代已复现问题的修复。

仍未覆盖：真机390px、暗色主题、全权限角色端到端、附件OCR服务异常的浏览器注入、生产性能压测。只读和客户失败路径以组件测试核验；保持先前相关流程测试基线。截图在浏览器审查中直接查看，未保存到报告目录。

**独立业务发现，未在本次UI范围修改：** 新一轮只读查询中，助手说不存在已成立客源人数，而左侧显示4人且右侧已有2份客源已确认。需另查 Agent 业务上下文/工具读取是否遗漏正式客源，不应通过改UI数字或文案掩盖。此发现意味着不能宣称整个Agent业务系统已可无条件交付。

代码未提交、未推送；保留原有未提交修改。

最终命令确认：`pnpm typecheck` 全工作区通过；`git diff --check` 通过。
