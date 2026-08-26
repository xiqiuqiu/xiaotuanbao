# Agent 平台底座回测验证报告

> 状态：原始回测完成；Issues #399–#401 修复复测完成
> 基线：`main` / `2c05257a692de93fa985a9187a0ecc8ad75f7de2`
> 回测日期：2026-08-26
> 结论口径：`通过` / `有条件通过` / `不通过`

## 0. 修复复测结论（2026-08-26）

第 1–6 节保留首次回测的原始失败证据；本节与第 7 节记录三张缺陷票修复后的最终结论。

| Issue | 修复 | 复测结果 |
|---|---|---|
| [#401](https://github.com/xiqiuqiu/xiaotuanbao/issues/401) | 拆分 Conversation 首次持久化与历史打开动作；历史切换清除隐式 locator，同一历史会话显式附加的 locator 可保留 | Web 5 files / 24 tests ✅；locator Playwright 3/3 ✅ |
| [#399](https://github.com/xiqiuqiu/xiaotuanbao/issues/399) | 按 route mask 契约保持刷新后的全局 Agent；移动登录改用 `/api/auth/me` 权威会话断言 | Playwright `retry=0` 连续 3 次，9/9 ✅ |
| [#400](https://github.com/xiqiuqiu/xiaotuanbao/issues/400) | 每次 suite 创建、迁移并销毁独立 PostgreSQL schema；每用例追踪并清理自有 Task/Conversation/job，清理前等待处理 Promise 终结 | 常驻 Worker保持运行时 `retry=0` 连续 10 次，110/110 ✅ |

最终门禁：`pnpm typecheck` ✅；`pnpm eval:offline` ✅；React Doctor 100/100 ✅。三项原始 P2 失败均已关闭验证链，未改变生产 Worker 权威调度语义。

## 1. 范围与方法

本报告验证近期合入 `main` 的 Conversation-first Agent 平台底座及既有 AI 建团竖切。权威边界按 [规格 #363](https://github.com/xiqiuqiu/xiaotuanbao/issues/363) 定义：PostgreSQL、Nest API、Worker、Action Gateway 和领域服务拥有持久状态、授权、恢复、幂等及业务结果；Headless Agent 只负责受约束执行。

动态回测应使用真实 Nest API、PostgreSQL、`AiWorkflowProcessor`、Action Gateway、领域服务与 `apps/api/test/support/deterministic-headless-agent.ts`。全量 API E2E 交由 CI；本地只跑聚焦 Agent E2E、契约测试和离线 Eval。

纳入的一手资料：

- 规格与切片：[#363](https://github.com/xiqiuqiu/xiaotuanbao/issues/363)、[#364](https://github.com/xiqiuqiu/xiaotuanbao/issues/364)、[#365](https://github.com/xiqiuqiu/xiaotuanbao/issues/365)、[#366](https://github.com/xiqiuqiu/xiaotuanbao/issues/366)、[#367](https://github.com/xiqiuqiu/xiaotuanbao/issues/367)、[#368](https://github.com/xiqiuqiu/xiaotuanbao/issues/368)、[#369](https://github.com/xiqiuqiu/xiaotuanbao/issues/369)。
- 安全硬化：[证据真实性 #379](https://github.com/xiqiuqiu/xiaotuanbao/issues/379)、[提案预校验与原子提交 #380](https://github.com/xiqiuqiu/xiaotuanbao/issues/380)、[权威目标解析 #381](https://github.com/xiqiuqiu/xiaotuanbao/issues/381)。
- 当前源码：`apps/api/src/modules/ai-create-task/`、`apps/api/src/modules/ai-action/`、`apps/agent/src/`、`packages/ai-contracts/src/`、`apps/api/prisma/schema.prisma`。
- 近期补充提交：全局/移动端 `33f30070c19760960f042bf46ed2b10885bb0951`、页面 locator `1a6cbef23a6dd9576c601eea5adbfde19b99267b`、Attempt 诊断与离线 Eval `0a28a07b8ca4e64210810722d5c1c83435c30e6f`。它们补齐 #363 中的投影、上下文与 Eval 验收，但不替代 #364–#369、#379–#381 的核心映射。

资料状态提醒：#363 仍 OPEN；#364–#369 与 #379 已 CLOSED；#380、#381 的 Issue 页面仍显示 OPEN，但对应 [PR #398](https://github.com/xiqiuqiu/xiaotuanbao/pull/398) 与 [PR #397](https://github.com/xiqiuqiu/xiaotuanbao/pull/397) 已于 2026-08-26 合入 `main`，不能据 Issue 状态误判为“未实现”。用户背景中的“平台 06–09”链接实际只指向标题为“平台 06”的 #369；本报告对指定 Issue 做完整追溯，并把可从 `main` 直接确认的后续补充提交单列，未把未提供的 Issue 当作已核对资料。

不在本任务中：业务代码重构、顺手修复、生产数据迁移、全量 API E2E、真实模型在线评分。

## 2. 需求 / 提交 / 测试映射

下表的“测试”表示可复现的验证入口，不表示本轮已经通过；实际执行状态统一填写在第 4 节。

| 需求与权威不变量 | Issue | `main` 合入提交 | 关键源码 | 可复现测试 / 断言 | 执行结果 |
|---|---|---|---|---|---|
| Conversation-first 总体边界；PostgreSQL/API/Worker 是唯一权威链；模型 Eval 不覆盖业务硬断言 | [#363](https://github.com/xiqiuqiu/xiaotuanbao/issues/363) | 总规格，无单一实现提交；由下列切片及 `0a28a07b8ca4e64210810722d5c1c83435c30e6f` 汇合 | `apps/api/prisma/schema.prisma`；`apps/api/src/modules/ai-create-task/ai-workflow.processor.ts`；`packages/ai-contracts/src/eval/runner.ts` | 聚焦 API E2E 组合；`pnpm eval:offline`；`packages/ai-contracts/src/eval/eval-runner.spec.ts` | ✅ 服务端链/Eval 通过；⚠ UI 上下文边界失败 F-01 |
| Definition/Capability 版本化 Registry、授权交集、Factory；模型字段不能伪造服务端身份或版本 | [#364](https://github.com/xiqiuqiu/xiaotuanbao/issues/364) | [PR #387](https://github.com/xiqiuqiu/xiaotuanbao/pull/387) / `3e28f13eced7166c61c9ff85cc8e6eae0ca1d4ec` | `packages/ai-contracts/src/runtime/agent-platform.ts`；`packages/ai-contracts/src/runtime/ai-create-definitions.ts`；`apps/agent/src/agent-factory.ts`；`apps/api/src/modules/ai-create-task/ai-operation-delegation.guard.ts` | `packages/ai-contracts/src/runtime/agent-platform.spec.ts`；`apps/agent/src/agent-factory.spec.ts`；`apps/api/src/modules/ai-create-task/ai-operation-delegation.guard.spec.ts`；`apps/api/src/modules/ai-action/ai-action.gateway.spec.ts` | ✅ 通过 |
| 普通查询不创建 Task；同 Conversation 串行、跨 Conversation 并行；单 running Attempt；停止、等待、迟到结果和租约恢复 | [#365](https://github.com/xiqiuqiu/xiaotuanbao/issues/365) | [PR #389](https://github.com/xiqiuqiu/xiaotuanbao/pull/389) / `0a81325bffbef03894b86a922096f11d2fe476eb` | `apps/api/src/modules/ai-create-task/ai-conversation.service.ts`；`apps/api/src/modules/ai-create-task/ai-workflow.processor.ts`；`apps/api/src/modules/ai-create-task/ai-create-task.lock.ts`；`packages/ai-contracts/src/runtime/conversation-general-definitions.ts` | `apps/api/test/agent-conversation-taskless.e2e-spec.ts`：纯文本、同会话排队、跨会话并行、waiting input、停止丢弃迟到结果、过期租约恢复、数据库单 running Attempt、用户隔离 | ✅ 通过（平台 E2E 38/38 的一部分） |
| 通用 AgentTask；建团扩展共享身份；停止 Attempt、取消等待项、关闭 Task 分离；确认后隔离遗留 Worker | [#366](https://github.com/xiqiuqiu/xiaotuanbao/issues/366) | [PR #390](https://github.com/xiqiuqiu/xiaotuanbao/pull/390) / `d65e161c226c10dcf7cf06586ca393261ac91257` | `apps/api/src/modules/ai-create-task/agent-task.service.ts`；`apps/api/src/modules/ai-create-task/agent-task.runtime.ts`；`apps/api/src/modules/ai-create-task/agent-task.controller.ts` | `apps/api/test/agent-task-lifecycle.e2e-spec.ts`；`apps/api/test/agent-task-confirm-isolation.e2e-spec.ts`；`apps/api/src/modules/ai-create-task/agent-task.runtime.spec.ts` | ✅ 通过 |
| 通用 Review Package 信封；并存提案；确认 CAS；版本冲突不部分写入；重复 decision 幂等 | [#367](https://github.com/xiqiuqiu/xiaotuanbao/issues/367) | [PR #391](https://github.com/xiqiuqiu/xiaotuanbao/pull/391) / `5a473f2df2dbf6609d1090b14225eae11e64edf2`；原子提交再叠加 PR #398 / `a3307c6` | `packages/ai-contracts/src/review/envelope.ts`；`apps/api/src/modules/ai-create-task/review-package.envelope.ts`；`apps/api/src/modules/ai-create-task/review-package.projection.ts`；`apps/api/src/modules/ai-create-task/ai-create-task.service.ts` | `apps/api/test/agent-review-package-conflict.e2e-spec.ts`；`apps/api/test/ai-create-review-package.e2e-spec.ts`；`apps/api/test/ai-create-review-durable.e2e-spec.ts` | ✅ 通过 |
| Conversation 私有来源；InputBatch 固定来源版本；上传不自动成为正式资料；跨会话不泄漏 | [#368](https://github.com/xiqiuqiu/xiaotuanbao/issues/368) | [PR #392](https://github.com/xiqiuqiu/xiaotuanbao/pull/392) / `86b1648447f922322e37398c3f51b85fd10fb903` | `apps/api/src/modules/ai-create-task/ai-conversation.service.ts`；`apps/api/src/modules/ai-create-task/departure-material.service.ts`；`apps/api/src/modules/ai-create-task/ai-context-manifest.ts`；`apps/api/src/modules/departure/departure.service.ts` | `apps/api/test/agent-conversation-source.e2e-spec.ts`：解析成功/失败、A/B 隔离、显式正式资料注册、无并行 task-owned material；材料屏障与恢复 E2E | ✅ 服务端通过 |
| 历史 API、搜索/归档、侧边栏切换；只读自己的 Conversation；历史切换不导航或自动注入当前页面 | [#369](https://github.com/xiqiuqiu/xiaotuanbao/issues/369) | [PR #393](https://github.com/xiqiuqiu/xiaotuanbao/pull/393) / `f934457bc0aa8270cd4e70e51d82fb084077fee0` | `apps/api/src/modules/ai-create-task/conversation-history.ts`；`apps/api/src/modules/ai-create-task/ai-conversation.service.ts`；`apps/web/src/features/agent-conversation/ConversationHistoryPanel.tsx` | `apps/api/test/agent-conversation-history.e2e-spec.ts`；`apps/web-e2e/tests/agent-conversation-history.spec.ts`；`apps/web/src/features/agent-conversation/ConversationHistoryPanel.test.tsx` | ❌ F-01：历史会话保留 page view/locator |
| 证据只来自冻结消息、固定资料/解析版本或系统规则；精确定位；任一证据无效则整提案失败 | [#379](https://github.com/xiqiuqiu/xiaotuanbao/issues/379) | [PR #386](https://github.com/xiqiuqiu/xiaotuanbao/pull/386) / `ef5985644a14c5c36e3483686d1189bd3cb1d25f`；live review 接线由 PR #398 完成 | `packages/ai-contracts/src/evidence/evidence-contract.ts`；`apps/api/src/modules/ai-create-task/evidence-validator.ts` | `apps/api/src/modules/ai-create-task/evidence-validator.spec.ts`：错误 excerpt、歧义定位、未知规则、未固定页/版本、Attempt/Manifest 不匹配、整包失败 | ✅ 通过 |
| `proposeReviewPackage` 只预校验、无 Action/Review/业务副作用；同 Attempt 可纠错；Worker 再校验后原子提交 | [#380](https://github.com/xiqiuqiu/xiaotuanbao/issues/380) | `a3307c647a67683196aff17b7b08954fcf501893` | `apps/api/src/modules/ai-create-task/review-proposal.validator.ts`；`apps/api/src/modules/ai-create-task/review-proposal.commit.ts`；`apps/api/src/modules/ai-create-task/evidence-authority.ts`；`apps/agent/src/mastra-headless.executor.ts` | `apps/api/src/modules/ai-create-task/review-proposal.prevalidate.spec.ts`；`review-proposal.commit.spec.ts`；`apps/api/test/ai-create-review-durable.e2e-spec.ts` 的 Action + package + outcome 原子场景 | ✅ 通过 |
| Action Gateway 使用服务端 normalized target；跨组织、越权、缺失/未固定/过期版本在转发前 DENY；授权后并发变化记录同 Action 执行失败 | [#381](https://github.com/xiqiuqiu/xiaotuanbao/issues/381) | `2c05257a692de93fa985a9187a0ecc8ad75f7de2` | `apps/api/src/modules/ai-action/ai-action.target.ts`；`ai-action.target-resolvers.ts`；`ai-action.prisma.target-authority.ts`；`ai-action.gateway.ts`；`apps/api/src/modules/ai-create-task/ai-tool-http.adapter.ts` | `apps/api/src/modules/ai-action/ai-action.gateway.spec.ts`：缺失/跨组织/非 owner/未固定/版本错/伪造 task DENY、normalized target 同一性、授权后并发失败保留 Action identity；HTTP/Worker adapter specs | ✅ 通过 |
| side/global/mobile 是同一 Conversation 投影，模式切换不复制会话或丢草稿 | [#363](https://github.com/xiqiuqiu/xiaotuanbao/issues/363) 后续 UI 切片 | `33f30070c19760960f042bf46ed2b10885bb0951` | `apps/web/src/features/agent-conversation/agent-conversation-runtime.store.ts`；`use-agent-conversation-draft.ts`；`agent-conversation-location.ts`；`apps/web/src/layouts/AssistPane.tsx` | `apps/web-e2e/tests/agent-conversation-modes.spec.ts`；对应 store/draft/location/AssistPane React tests | ⚠ F-02：Playwright 3/3 场景红，验收不可重复 |
| 当前页面 locator 由服务端校验并冻结；伪造、缺失、跨组织、无权限 locator 在 InputBatch 前拒绝 | [#363](https://github.com/xiqiuqiu/xiaotuanbao/issues/363) 后续上下文切片 | `1a6cbef23a6dd9576c601eea5adbfde19b99267b` | `packages/shared/src/agent/page-locator.ts`；`apps/api/src/modules/ai-create-task/page-locator.resolver.ts`；`apps/api/src/modules/ai-create-task/ai-conversation.service.ts` | `apps/api/test/agent-page-locator.e2e-spec.ts`；`apps/web-e2e/tests/agent-page-locator.spec.ts`；shared/web locator specs | ✅ 服务端拒绝通过；❌ 历史 UI 投影失败 F-01 |
| Eval 可重复并分离 hard/deterministic/golden/model；模型质量不可覆盖权限、金额、版本、幂等与业务效果 | [#363](https://github.com/xiqiuqiu/xiaotuanbao/issues/363) Eval 验收 | `0a28a07b8ca4e64210810722d5c1c83435c30e6f` | `packages/ai-contracts/src/eval/catalog.ts`；`runner.ts`；`baseline.ts`；`packages/ai-contracts/scripts/eval-offline.mjs`；`apps/api/src/modules/ai-create-task/attempt-diagnostic.ts` | `pnpm eval:offline`；`packages/ai-contracts/src/eval/eval-runner.spec.ts`；`apps/agent/src/offline-eval.smoke.spec.ts` | ✅ 两次命令均稳定通过 |

## 3. 回测场景与硬断言

| ID | 场景 / 复现入口 | 必须观察的硬断言 | 层级 | 状态 |
|---|---|---|---|---|
| BT-01 | 普通纯文本发送，驱动 Worker 与 Deterministic Headless Agent | 不创建 AgentTask；一次 User 消息只进入一次；Attempt/Manifest/Outcome 可追溯 | hard + deterministic | ✅ |
| BT-02 | 同 Conversation 连续发送；另一个 Conversation 同时发送 | 同会话严格串行且仅一 running Attempt；跨会话并行 | hard | ✅ |
| BT-03 | waiting user/review、完成、失败、取消、停止 | 每个终态释放运行槽；停止 Attempt、取消等待、关闭 Task 状态边界不混淆 | hard | ✅ |
| BT-04 | Worker claim 后中断、租约过期、generation takeover、迟到 completion | 只保留当前 generation 结果；无重复 Action/Outcome/业务写入 | hard | ✅ |
| BT-05 | 相同 Idempotency-Key、相同审核 decision、网络重放 | 返回同一逻辑结果；Review Package 与领域副作用各最多一次 | hard | ✅ |
| BT-06 | 模型 payload 伪造 organizationId/userId/taskId/attemptId/capabilityVersion | RequestContext/Attempt 快照不被覆盖；未授权工具不暴露、不转发 | hard | ✅ |
| BT-07 | 缺失、跨组织、非 owner、对象越界、unavailable Capability | Gateway 在 adapter 前 DENY；领域服务调用次数为 0；留下可审计拒绝记录 | hard | ✅ |
| BT-08 | 伪造 target、错误 object/parse version、未固定 material | normalized target 仅由服务端解析；转发前 DENY | hard | ✅ |
| BT-09 | Gateway ALLOW 后领域对象并发变化 | 同一 Action identity 记录执行失败；不新建第二 Action；无业务写入 | hard | ✅ |
| BT-10 | review 提案先提交错误证据，再在同 Attempt 修正 | 首次预校验无 Action/Review/副作用；修正后可继续；整包任一无效则拒绝 | hard | ✅ |
| BT-11 | Worker 接受有效提案，故障注入在 Action/package/outcome 边界 | Action、Review Package、`awaiting_review` outcome 同事务原子出现或全部不出现 | hard | ✅ |
| BT-12 | 用户 patch 审核候选后确认/拒绝 | User correction 与模型 evidence 分开保存；拒绝无业务写入；确认 CAS | hard | ✅ |
| BT-13 | Conversation A/B 各自上传来源；A 的 InputBatch 执行 | B 看不到 A 来源；使用版本可追溯；上传不自动成为正式资料 | hard | ✅ |
| BT-14 | 当前页 locator、历史会话、Manifest 与预算超限 | locator 权限/组织/版本硬校验；历史不自动注入当前页；当前命令和权威事实不被裁掉 | hard | ❌ F-01（服务端校验通过，历史 UI 投影失败） |
| BT-15 | side/global/mobile/history 间切换并保留未发送草稿 | Conversation ID 不变、不复制；草稿不丢；业务 URL 只在显式动作后变化 | deterministic + browser | ⚠ F-02（浏览器验收未能完成） |
| BT-16 | 原 AI 建团纯文本 → 审核确认 → 最终发团 | 最终 Departure、权限、版本和幂等结果与既有契约一致 | hard | ✅ |
| BT-17 | 建团附件解析成功/失败、Worker 重启/失败批次重试、权限撤销、对象版本变化 | 失败可安全恢复或拒绝；无重复副作用；撤权/版本冲突绝不写业务 | hard | ✅；HITL 聚合 suite 有 F-03 隔离抖动 |
| BT-18 | 离线 Eval 基线重复两次并注入 hard fail / model fail | 报告稳定；hard/deterministic/golden/model 分层；高模型分不得覆盖 hard fail | hard + deterministic + golden + model | ✅ |

## 4. 执行命令与结果

环境：Node `v24.17.0`、pnpm `11.23.0`、PostgreSQL 16（`localhost:5432`，78 migrations，schema up to date）、真实 Nest `createTestApp()`、真实 `PrismaClient`、`AiWorkflowProcessor`、Action Gateway、领域服务，以及独立 HTTP Deterministic Headless Agent/Parse Worker。E2E 全部 `--runInBand`；发现常驻 Docker API/Worker 抢占同库测试 job 后，已停止该容器、隔离复跑，并在结束时恢复容器。

| 命令 | 覆盖范围 | 结果 | 证据 |
|---|---|---|---|
| `pnpm typecheck` | 全仓类型边界 | ✅ exit 0 | 7/7 workspace projects 完成 |
| `pnpm eval:offline` | hard/deterministic/golden/model 分层与重复性 | ✅ exit 0 | first/second 相等；hard 5、deterministic 4、golden 1 全过；model `0.82` 且未覆盖 hard |
| `pnpm --filter @xiaotuanbao/ai-contracts eval:offline` | ai-contracts 独立离线 Eval | ✅ exit 0 | 第二次独立命令结果相同，`comparison.equal=true` |
| 7 个 `agent-*.e2e-spec.ts` 聚焦 suite | 无任务会话、Task/Attempt、Review、来源、locator、历史、Worker 隔离 | ✅ exit 0 | 7 suites / 38 tests 全过，16.4s |
| 10 个 `ai-create-*.e2e-spec.ts` 建团回归 suite | 纯文本、附件、审核、最终发团、恢复、权限、版本 | ⚠ 首轮 7 suites 过、3 suites 受共享 Worker 干扰；隔离复跑 2 suites 全过，1 suite 见 F-03 | 有效业务断言 69 项中未见产品失败；原首轮 4 失败中 3 项隔离后消失 |
| API Gateway/证据/Review/Context 10 个聚焦单测 | normalized target、跨组织/越权/版本、证据、原子提交、预算 | ✅ exit 0 | 10 suites / 126 tests 全过 |
| Agent 6 个聚焦单测 | Definition/Factory/Headless/Review/Eval smoke | ✅ exit 0 | 6 suites / 31 tests 全过 |
| ai-contracts 5 个聚焦单测 | Registry/Capability/Headless/Review/Eval runner | ✅ exit 0 | 5 suites / 33 tests 全过 |
| shared locator 单测 | locator schema/route allowlist/字段剥离 | ✅ exit 0 | 1 suite / 5 tests 全过 |
| `vitest run src/features/agent-conversation ...` | 会话投影、草稿、历史、locator | ❌ exit 1 | 11 files：10 过 1 失败；40 tests：39 过 1 失败；失败场景单 suite 连续 3/3 复现 F-01 |
| 3 个 Agent Playwright specs | 历史、side/global/mobile、locator | ❌ exit 1 | 7 tests：3 过 4 失败（均 retry 后仍失败）；F-01/F-02 |
| HITL suite 连续 3 次 | waiting material 与排队顺序可重复性 | ⚠ 2 次全过、1 次 10/11 | 单失败场景独立运行通过；F-03 |
| `npx react-doctor@latest --verbose --scope changed` | Web 扫描 | ✅ 命令成功，非验收通过 | 无 diff，自动全扫 565 files；91/100，4 warnings，无 error |
| `pnpm check:permission-matrix` | 当前工作树权限面门禁 | N/A | 当前仅新增报告，无权限面 diff，脚本按设计直接退出 0 |

### 静态追溯观察（不是动态通过结论）

- `apps/api/test/support/deterministic-headless-agent.ts` 启动真实 HTTP Deterministic Headless Agent；聚焦 E2E 通过 `createTestApp()` 启动 Nest，并直接连接 `PrismaClient`，由 `AiWorkflowProcessor` 驱动作业，符合“真实 API + PostgreSQL + Worker + Headless seam”的测试结构。
- `packages/ai-contracts/src/eval/runner.ts` 显式产出 `hard`、`deterministic`、`golden`、`model` 四层，且 `model.overrodeHardAssertions` 固定为 `false`；`eval-runner.spec.ts` 覆盖“模型满分也不能覆盖 hard fail”和同输入报告可比较。
- 当前 `pnpm eval:offline` 使用 `packages/ai-contracts/src/eval/baseline.ts` 的固定 baseline observation。它验证分层与可重复的 runner 契约，但单独运行不能证明本次真实 API/数据库业务不变量；必须与上述 API/Worker E2E 结果合并判定。
- `apps/api/src/modules/ai-action/ai-action.gateway.spec.ts` 已列出跨组织、非 owner、缺失对象、未固定资料、错误版本、模型伪造 task、normalized target 一致性及授权后并发失败等负向测试；是否满足验收仍以本轮实际执行结果为准。

## 5. 失败项与风险分级

风险分级：

- P0：组织隔离、权限绕过、证据伪造导致未授权业务写入或敏感数据泄漏。
- P1：原子性、版本冲突、幂等、Worker 恢复失败，或既有建团主流程回归。
- P2：可恢复的生命周期/投影/上下文错误，不产生越权或错误最终业务状态。
- P3：仅模型质量、非阻断体验、诊断或报告问题。

### F-01：从页面侧栏选择历史会话后仍继承当前页 locator（P2，业务硬断言失败）

- 复现步骤：
  1. 在任一可定位发团详情页展开电子化助理，新会话自动附带当前页 chip。
  2. 打开历史列表并选择已有历史 Conversation。
  3. 观察 store `view`、current-page chip，并运行 `ConversationHistoryPanel.test.tsx` 或 `agent-page-locator.spec.ts`。
- 实际结果：`conversationId/title` 切换成功，但 `view` 仍为 `page`、旧 `attachedPageLocator` 未清理；浏览器 current-page chip 仍存在。Vitest 单 suite 连续 3/3 失败；Playwright retry 后仍失败。
- 预期结果：历史会话进入 `view: history`，默认不携带当前业务页 locator；只有 User 显式“获取当前页面”后才附加。
- 影响范围：违反“历史会话不会自动注入当前页面上下文”；可能让历史 Conversation 的下一轮模型输入混入当前页面事实。服务端仍会做组织/权限/版本校验，因此本轮未证明越权或错误业务写入，定级 P2。
- 相关 Issue / 提交 / 文件：[#369](https://github.com/xiqiuqiu/xiaotuanbao/issues/369)、[#371](https://github.com/xiqiuqiu/xiaotuanbao/issues/371)、`1a6cbef23a6dd9576c601eea5adbfde19b99267b`；`apps/web/src/features/agent-conversation/agent-conversation.store.ts:56`、`ConversationHistoryList.tsx:98`。
- 证据：`ConversationHistoryPanel.test.tsx:125` 期望 `history`、实际 `page`；`agent-page-locator.spec.ts:99` 期望 chip 数 0、实际 1。

### F-02：#370 Playwright 验收与 route mask/mobile 登录前提不一致（P2，验证阻断）

- 复现步骤：启动真实 API/Web，运行 `pnpm --filter web-e2e exec playwright test tests/agent-conversation-modes.spec.ts`。
- 实际结果：3/3 场景在 retry 后仍失败：两个场景在全局 overlay 已出现时仍因可见 URL 留在 `/departure` 而失败；移动场景在通用登录 helper 找不到桌面用户名按钮时失败，尚未进入 Agent 移动断言。
- 预期结果：Playwright 应与 `useExpandAgentConversation.ts` 的 TanStack route mask 合约一致，并能在移动导航布局完成登录；随后验证 Conversation ID、草稿、刷新、返回位置和移动端操作。
- 影响范围：#370 的浏览器验收不可重复，无法用该 suite 证明刷新/草稿/移动端全链；现有相关 Vitest 通过，但不能替代真实浏览器验证。
- 相关 Issue / 提交 / 文件：[#370](https://github.com/xiqiuqiu/xiaotuanbao/issues/370)、PR #394 / `33f30070c19760960f042bf46ed2b10885bb0951`；`apps/web-e2e/tests/agent-conversation-modes.spec.ts:46`、`:76`、`:115`；`apps/web/src/features/agent-conversation/use-expand-agent-conversation.ts:22`。
- 证据：Playwright 7 tests 中相关 3 tests 均 retry 后失败；trace/screenshot 生成在 `apps/web-e2e/test-results/`（测试产物未纳入 Git）。

### F-03：HITL 聚合 E2E 使用全局 `processDueJobs(5)`，受前序残留 job 影响而抖动（P2，测试隔离）

- 复现步骤：隔离常驻 Docker Worker 后连续 3 次运行 `ai-create-queued-input-and-hitl.e2e-spec.ts`。
- 实际结果：第 1/3 次 11/11 通过，第 2 次在“带附件回答前不抢跑预排队 batch”处得到 `pendingInteraction=undefined`；该失败用例单独运行通过。另一轮全套曾在“取消等待后排队 batch 应完成”处留下 `ready_for_agent`。
- 预期结果：同一 suite 重复运行稳定全绿，前序测试残留 job 不应消耗当前测试的全局处理上限。
- 影响范围：Worker/HITL 回归套件可重复性下降；证据指向测试数据隔离/driver 选择问题，未观察到重复副作用或错误最终业务状态。
- 相关 Issue / 提交 / 文件：[#318](https://github.com/xiqiuqiu/xiaotuanbao/issues/318)；`apps/api/test/ai-create-queued-input-and-hitl.e2e-spec.ts:478`；`apps/api/src/modules/ai-create-task/ai-workflow.processor.ts:111`。
- 证据：连续 3 次为 pass/fail/pass；失败用例独立运行 1/1 通过。

## 6. GitHub Issue 草稿

> 仅在发现缺陷时填写；本任务不直接创建 Issue，也不扩大修改范围。

### 草稿 1：切换历史 Conversation 时清除隐式页面 locator

- 标题：`fix(agent-web): 历史会话切换不得继承当前页面 locator`
- 背景与影响：历史会话从页面侧栏选中后仍保持 `view=page` 与旧 locator，违反 #369/#371 上下文隔离。
- 最小复现：运行 `ConversationHistoryPanel.test.tsx`，或执行 `agent-page-locator.spec.ts` 的“历史会话不自动带页面”。
- 实际 / 预期：实际保留 page view/chip；预期切为 history 并清掉隐式 locator，显式捕获除外。
- 风险等级：P2。
- 相关提交与文件：`1a6cbef`；`agent-conversation.store.ts`、`ConversationHistoryList.tsx`。
- 建议验收测试：保留首轮新会话持久化 locator 的现有用例；新增“初始 page/null + implicit locator → 直接从历史列表选择”的 store 单测；Vitest/Playwright 全绿。

### 草稿 2：修复 #370 浏览器验收与 route mask/mobile 登录契约

- 标题：`test(agent-web): 对齐全局会话 route mask 并补齐移动端登录回测`
- 背景与影响：#370 三条 Playwright 场景当前全部阻断，无法验收刷新、草稿和移动端。
- 最小复现：运行 `tests/agent-conversation-modes.spec.ts`。
- 实际 / 预期：实际 URL/mobile helper 前置失败；预期依据产品路由决定断言 masked/unmasked location，并在移动布局完成登录后执行 Agent 断言。
- 风险等级：P2。
- 相关提交与文件：`33f30070`；`agent-conversation-modes.spec.ts`、`support/auth.ts`、`use-expand-agent-conversation.ts`。
- 建议验收测试：侧栏→全局→刷新→返回，校验同一 Conversation ID/草稿；流式切换；390×844 移动断言。

### 草稿 3：隔离 HITL E2E job 或按当前 Conversation 驱动 Worker

- 标题：`test(agent): 消除 HITL E2E 的跨用例 pending job 抖动`
- 背景与影响：suite 使用全局 `processDueJobs(5)`，前序用例残留 job 会占用 limit，形成 pass/fail/pass。
- 最小复现：连续 3 次运行 `ai-create-queued-input-and-hitl.e2e-spec.ts`。
- 实际 / 预期：实际偶发当前 job 未被处理；预期重复运行稳定全绿。
- 风险等级：P2。
- 相关提交与文件：`ai-create-queued-input-and-hitl.e2e-spec.ts`、`ai-workflow.processor.ts:111`。
- 建议验收测试：每用例清理/终结自有 Conversation job，或提供按 job/conversation 精确驱动的测试入口；至少连续 10 次稳定。

## 7. 结论

原始回测结论：**不通过**。修复复测后的最终结论：**通过**。

判定规则：

- `通过`：控制面权威链、权限/组织/证据/目标/版本/原子性/恢复/幂等硬断言与既有建团主流程全部通过。
- `有条件通过`：硬断言和既有建团流程全部通过，仅模型质量或非阻断体验失败。
- `不通过`：任一权限、组织隔离、证据真实性、目标解析、原子性、恢复、版本冲突、幂等、金额/最终业务效果或既有建团主流程硬断言失败。

服务端控制面、权限/组织隔离、证据真实性、normalized target、版本冲突、原子性、Worker 恢复/幂等，以及原有 AI 建团主流程的聚焦硬断言均通过；未发现 P0/P1 服务端或最终业务效果回归。离线 Eval 也能稳定区分 hard/deterministic/golden/model，且模型分不会覆盖 hard fail。

首次回测发现的 F-01/F-02/F-03 已分别由 #401/#399/#400 修复并完成真实浏览器、API/PostgreSQL/Worker 与 Deterministic Headless Agent 聚焦复测。权限、组织隔离、证据真实性、目标解析、版本、原子性、幂等与既有建团主流程的硬断言仍保持通过；模型质量评分没有覆盖硬断言。

是否可进入下一阶段业务竖切：**可以**。建议后续 PR 继续保留本报告中的聚焦门禁，并由 CI 承担 API 全量 E2E。
