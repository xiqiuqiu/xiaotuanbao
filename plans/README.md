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

## 批次与验证门

1. **安全与正确性**：001、002、004、005、006、007。每个计划先跑聚焦测试；批次结束跑 web/api typecheck 与认证/财务相关测试。
2. **性能与语义**：003、008、009、012。用浏览器 Network 核对搜索请求数量，并完成键盘验证。
3. **结构与清理**：010、011、013。只做行为保持型移动，React Doctor 目标诊断必须清除。
4. **最终门**：全量 `pnpm -r run typecheck`、web/API 测试、web build、全量 React Doctor；再按 `code-review` 同时检查仓库标准与本计划符合性。
