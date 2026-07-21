# React 优化计划

- 基线 commit：`b77379c`
- 来源：2026-07-14 `improve-react` 全库审查
- 原则：先保证财务数据真实性与安全，再处理交互/性能，最后做结构性重构与低风险清理。

| 执行顺序 | 计划 | 严重度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 1 | [001 — HttpOnly 认证会话](001-http-only-auth-session.md) | HIGH | DONE | 无；跨前后端、需独立回归 |
| 2 | [002 — 财务主列表错误态](002-finance-list-error-states.md) | HIGH | DONE | 无 |
| 3 | [004 — 行程段键盘激活](004-fix-segment-keyboard-activation.md) | HIGH | DONE | 无 |
| 4 | [005 — Commit-safe 账款定位](005-commit-safe-payment-locate.md) | MEDIUM | DONE | 无 |
| 5 | [006 — 取消过期复制流程](006-cancel-stale-copy-flow.md) | MEDIUM | DONE | 无 |
| 6 | [007 — 财务详情错误态](007-finance-detail-error-states.md) | MEDIUM | DONE | 002 的错误态模式 |
| 7 | [003 — 财务搜索防抖与取消](003-debounce-finance-search.md) | HIGH | DONE | 002；避免性能改造掩盖错误态 |
| 8 | [008 — 统一财务发团查询键](008-unify-finance-departure-query-key.md) | MEDIUM | DONE | 无 |
| 9 | [009 — 移除 Link/Button 嵌套](009-remove-link-button-nesting.md) | MEDIUM | DONE | 无 |
| 10 | [012 — 图标按钮 Tooltip](012-add-icon-button-tooltips.md) | LOW | DONE | 004；避免重复修改执行导航 |
| 11 | [010 — 提取行程段导航面板](010-extract-execution-segment-list.md) | MEDIUM | DONE | 004、012；行为稳定后再移动结构 |
| 12 | [011 — 提取资源表格列配置](011-extract-resource-table-columns.md) | MEDIUM | DONE | 无 |
| 13 | [013 — 删除未使用应付标签](013-remove-unused-payable-labels.md) | LOW | DONE | 无 |

## 2026-07-16 追加（基线 commit `3876d55`）

来源：2026-07-16 `improve-react` 全库审查。React Doctor 静态扫描 100/100、0 诊断；以下为「扫描之外」的架构缺口。

| 执行顺序 | 计划 | 严重度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 14 | [014 — 路由错误边界](014-route-error-boundary.md) | HIGH | DONE | 无；建议优先 |
| 15 | [015 — 路由级代码分割](015-route-code-splitting.md) | MEDIUM | DONE | 无；与 014 同改 `createRouter`，合并时两选项都保留 |

## 2026-07-18 追加（基线 commit `a712d4a`）

来源：2026-07-18 `improve-react` 全库审查。React Doctor 静态扫描 100/100、0 诊断（296 文件）；以下为「扫描之外」的正确性 / 性能 / 结构缺口，均已在 `file:line` 处核实（含读 `@rc-component/form` 源码确认表单复用行为）。

| 执行顺序 | 计划 | 严重度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 16 | [016 — 打开核销抽屉重置表单](016-reset-verification-form-on-open.md) | HIGH | DONE | 无；建议优先（财务正确性） |
| 17 | [017 — 定位结束清空 pendingPage](017-fix-locate-pending-page-reset.md) | HIGH | DONE | 无；建议优先（翻页锁死） |
| 18 | [018 — 精简核销 schedules queryKey](018-trim-verification-schedules-query-key.md) | MEDIUM | DONE | 与 016/021 同改核销抽屉，合并注意 |
| 19 | [019 — Partner 详情 Tab destroyOnHidden](019-partner-detail-tabs-destroy-on-hidden.md) | MEDIUM | DONE | 无 |
| 20 | [020 — 收付款 keyword 防抖](020-debounce-payment-schedule-keyword.md) | MEDIUM | DONE | 无；与 017 同改 workspace/locate 链 |
| 21 | [021 — 核销切换发团清选择](021-clear-verification-selection-on-departure-change.md) | MEDIUM | DONE | 与 016/018 同改核销抽屉 |
| 22 | [022 — 执行资源列 useMemo](022-memoize-execution-resource-columns.md) | MEDIUM | DONE | 无 |
| 23 | [023 — 发团路线名防抖](023-debounce-departure-route-name-filter.md) | MEDIUM | DONE | 无 |
| 24 | [024 — 深链清空解除核销锁定](024-clear-verification-lock-on-deeplink-removal.md) | MEDIUM | DONE | 无；置信度中，需双向行为验证 |
| 25 | [025 — 提取核销候选表格列](025-extract-create-verification-table-columns.md) | MEDIUM | DONE | 建议 016/018/021 稳定后再移动结构 |

建议批次：
1. **正确性优先**：016、017（两个 HIGH，各自独立回归）。
2. **核销抽屉一组**：018、021（+016）尽量同批改，减少同文件冲突。
3. **性能**：019、020、022、023，用 Network/Profiler 验证请求数与重渲染。
4. **边界一致性 / 结构**：024（双向验证后合入）、025（行为保持型平移，最后做）。

## 2026-07-21 追加（基线 commit `9477cf7`）

来源：2026-07-21 `improve-react` 全库审查。React Doctor **67/100**、14 条诊断（3 error / 11 warning）；热路径含工作台图表、列表 placeholder、流水表单。`no-children-prop`（DualAxes series API）已剔除为噪声。

| 执行顺序 | 计划 | 严重度 | 状态 | 依赖 |
| --- | --- | --- | --- | --- |
| 26 | [026 — 列表 filter placeholder 提交时机](026-fix-list-placeholder-filter-commit.md) | HIGH | DONE | 无；建议最先（多列表正确性） |
| 27 | [027 — 工作台图表点击清理](027-cleanup-workbench-chart-click.md) | HIGH | DONE | 无；清除 3 条 error 诊断 |
| 28 | [028 — key/事件重置流水表单](028-reset-transaction-form-via-key.md) | MEDIUM | DONE | 无；先于 032/035 |
| 29 | [029 — 取消过期客源单影响查询](029-cancel-stale-source-order-impact.md) | MEDIUM | DONE | 无；先于 036 |
| 30 | [030 — 核销节点与流水并行预取](030-prefetch-verification-schedules.md) | MEDIUM | DONE | 无 |
| 31 | [031 — 发团列表 AbortSignal](031-abort-departure-list-requests.md) | MEDIUM | DONE | 无；可与 026 同批注意 DeparturesPage |
| 32 | [032 — lastSuggestedYuan 改 ref](032-transaction-form-suggested-amount-ref.md) | MEDIUM | DONE | 建议 028 后或同 PR |
| 33 | [033 — 建团路线模板键盘选择](033-keyboard-select-route-template.md) | MEDIUM | DONE | 无 |
| 34 | [034 — 筛选控件 aria-label](034-filter-controls-aria-labels.md) | MEDIUM | DONE | 无 |
| 35 | [035 — 拆分 TransactionFormDrawer](035-extract-transaction-form-drawer-sections.md) | MEDIUM | DONE | 028、032 |
| 36 | [036 — 拆分 SourceOrdersTab](036-extract-source-orders-tab-sections.md) | MEDIUM | DONE | 029 |
| 37 | [037 — 拆分 TransactionsWorkspace](037-extract-transactions-workspace-sections.md) | MEDIUM | DONE | 026 |
| 38 | [038 — 删除未使用 source type labels](038-remove-unused-payment-schedule-source-labels.md) | LOW | DONE | 无；可随时做 |

建议批次：
1. **正确性**：026、027、028、029（两个 HIGH + 表单/竞态）。
2. **性能**：030、031、032（Network / Profiler）。
3. **无障碍**：033、034。
4. **结构 / 清理**：035–037（行为稳定后拆）、038。

执行记录（分支 `improve-react/2026-07-21`）：026–038 已按推荐顺序落地；scoped React Doctor **89/100**（基线 67）。026 的 `commitListFilterKey` 落在 `useEffect`（保留「仅非 placeholder 成功才 commit」语义，避免 `no-prop-callback-in-render`）。剩余 1 条 warning：`VerificationsWorkspace` `no-giant-component`（07-21 计划范围外）。

## 批次与验证门

1. **安全与正确性**：001、002、004、005、006、007；以及 026–029。每个计划先跑聚焦测试；批次结束跑 web typecheck 与相关 vitest。
2. **性能与语义**：003、008、009、012；以及 030–032。用浏览器 Network / Profiler 核对请求与重渲染。
3. **无障碍**：033、034。键盘与 Accessibility 树抽查。
4. **结构与清理**：010、011、013；以及 035–038。只做行为保持型移动，React Doctor 目标诊断必须清除。
5. **最终门**：全量 `pnpm -r run typecheck`、web 测试、web build、全量 React Doctor；再按 `code-review` 同时检查仓库标准与本计划符合性。
