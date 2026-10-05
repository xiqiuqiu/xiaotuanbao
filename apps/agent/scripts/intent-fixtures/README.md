# Agent 真实模型语义评测

仓库根目录运行：

```sh
pnpm --filter @xiaotuanbao/ai-contracts build
pnpm --filter agent exec tsx --test scripts/intent-fixtures/scoring.test.ts
pnpm --filter agent exec tsx scripts/intent-eval.ts
```

读取与 Agent 相同的 `.env` / 已导出变量：`DEEPSEEK_API_KEY`、`AI_MODEL`、`AI_MODEL_BASE_URL`、`AI_MODEL_THINKING`、`AI_MODEL_THINKING_EFFORT`。缺少 key 时失败，不回落为 mock 模型。

默认 16 例、每例重复三次。`INTENT_EVAL_MATRIX=extended` 仅跑后加的 8 例（通用会话、发团协作、恢复和撤销）；可用 `INTENT_EVAL_REPEATS=1` 和 `INTENT_EVAL_CASE=negation` 缩小运行。`INTENT_EVAL_OUTPUT` 指定 JSON 路径，默认 `/tmp/xiaotuanbao-intent-eval.json`。任一反例失败时退出码为 1。

直接复用生产 Agent factory、instructions、事项工具、provider stream 和 Headless 完成校验。业务 API 固定指向本进程的 loopback fixture，不使用环境中的业务 API 或真实委托凭据。审核提案仅在内存中返回 schema 合法结果，不写业务、不验证生产授权或证据真实性。

团名提案使用建团草稿 Definition；通用会话评测操作咨询与否定查询；发团协作评测真实只读查询和歧义。各 Definition 仅授予自身已有的必要能力。恢复样本通过与 API 输入相同的「未决交互」结构显式提供 pendingItems，同时传入 Headless 请求；核对恢复后 id/request/goal 保持。撤销校验使用 currentUserText 用户原文。

判分比较逐项结果类型及条数；变更样本还验证真实生成的提案包含预期团名。报告保留 Definition、输入、模型实际事项与工具诊断，统计失败和多余追问。它不验证回答全文语义，也不证明完整生产恢复、授权和证据校验已通过。真实 provider 误差应通过重复报告观察，不能用这里的 scorer 单测替代模型质量证据。
