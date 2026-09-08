# UI audit — Agent 协作页面
Branch: audit-and-fix
Files: DepartureCollaborationWorkspace.tsx/module.css；SourceOrderReviewPanel.tsx/module.css；SourceOrderReviewField.tsx；SegmentResourceReviewPanel.tsx/module.css。只读调用链：DepartureSourceOrderReview、AssistPane。
Findings: F1 P1 Workspace.items 按钮模拟导航，DESIGN Navigation，A3/A7 → Tabs + Tag。F2 P1 Workspace.evidence/snapshot 与 SourceOrderReviewPanel.fields 普通文本堆叠，DESIGN Details → Descriptions；材料 Collapse 内按字段显示。F3 P1 SourceOrderAmountPreview 自制指标 → Statistic，A5/A13。F4 P1 SegmentResourceReviewPanel.fields 与客源编辑自制 label → Form vertical，A8。F5 P1 SourceOrderReviewField 重复明细用段落 → Table，A9。F6 P1 SourceOrderReviewPanel.groups !important 重写组件内部样式 → 默认 Collapse 及语义属性，A7。
逐轴覆盖所有范围文件：A1 pass 单一主操作；A2 pass token；A3 F1；A4 waive 专用协作详情；A5 F3；A6 pass；A7 F1/F6；A8 F4（专用审核区无需 Drawer）；A9 F5（小型完整明细不分页）；A10 pass 现有反馈保留；A11 pass Alert；A12 pass 草稿动作；A13 F2/F3；A14 pass。保留 CopilotKit 聊天壳，独立滚动及底部操作。

## 修复结果

- F1：事项使用标准线型 Tabs，标题与状态 Tag 分层；长标题提供完整 title。分类隐藏无关标签但保留已挂载审核内容，避免未保存草稿丢失；单项不显示空的溢出菜单。
- F2：历史审核使用带边框 Descriptions；待审各组采用紧凑 Descriptions；材料依据用 Collapse 按字段标注，同一字段的重复片段去重。单字段组避免重复标题。
- F3：团款预览使用 Statistic，保留原有以分计算、金额格式化和实时重算逻辑，突出结算金额。
- F4：资源修改、客源组内编辑使用 vertical Form 与 Form.Item；保留控件验证、权限、加载锁定和提交逻辑。
- F5：团款调整和游客只读明细使用 Table；金额右对齐，游客名单内部横滚，完整小型明细不分页。
- F6：移除 Collapse 内部 padding 的 !important 覆盖，使用默认分组边框、背景与展开交互。
- 保留三栏与 CopilotKit 聊天壳；Tabs 内容高度受父容器约束，仅审核内容滚动，确认栏覆盖至底边。没有业务数据变更、提交或推送。

## 复验

- `pnpm typecheck` 全工作区通过；最后组件改动后的 web typecheck 再次通过。
- 4个相关测试文件、24项测试通过；补充事项 aria-selected 与分类切换后审核节点不卸载的断言。原金额输入测试确认连续输入1250.50按125050分保存。
- 四个修改的 Ant Design TSX 组件 lint 均0问题；`git diff --check` 通过。
- React Doctor changed：修改前82/100，修改后82/100，均10项提示。没有压制规则或修改扫描配置。
- 实际浏览器：1560×870桌面、500×844窄屏；核对客源待审、已确认快照、资源表单、证据展开、事项切换、分类筛选、键盘焦点和底部操作。窄屏 document.scrollWidth=500，无整页横向溢出。
- 浏览器将客源草稿人数2改为3，切换执行安排后返回，草稿仍为3且预览3100元；取消恢复2人与2100元。未点击保存、确认或拒绝。
- 已恢复桌面视口，停留在原协作的第4项待审客源，便于查看。

复审：本轮F1–F6已处理；原有三栏专用审核区、框架内置间距、小型完整明细不分页为waive。无本轮遗留P0/P1；本结论限定于组件与交互展示，不代表Agent业务准确性或全站质量认证。
