# PRD：客源代收轧差、定金/尾款分账与返利应付

**状态**：已定稿（产品六问 2026-07-27；Issue [#187](https://github.com/xiqiuqiu/xiaotuanbao/issues/187)）  
**Menu Key**：`/departure`（客源单 / 发团概览）；应付侧复用 `/finance/*` 与 Partner 往来账款  
**域词汇**：见根目录 [CONTEXT.md](../../CONTEXT.md)（重点：Source Order、Collection Split、Partner Collected Deposit、Customer Settlement Receivable、Guest Collection Receivable、Source Order Rebate Payable、Settlement Amount）  
**决议来源**：[ADR-0033](../adr/0033-source-order-rebate-and-split-collection.md)；六问定稿；部分取代 ADR-0002「付给合作方仅手工」；修订 ADR-0010「路径之和=结算金额」

---

## Problem Statement

地接在客源业务中经常按合作方「收客价」向游客代收定金与尾款，地接最终只应得团款（结算金额 S）。现系统强制「客户已收 P + 我方代收 G = S」，且客户补款应收金额等于 P；游客代收仅一张应收；多收部分无法结构化为付给合作方的返利，只能堆在流水或靠手工应付。结果是：定金很大/很小时轧差语义错误、代收大于团款时无法表达返利、定金与尾款账单无法分开、发团概览看不到返利。

## Solution

按 ADR-0033 改造客源收款模型：

- 地接与合作方现金往来只看地接代收 **G** 与结算金额 **S**：客户补款 = `max(0, S−G)`，返利应付 = `max(0, G−S)`；合作方已收定金 **P** 不进公式。
- 录单分别录入定金与尾款；约定 G 做计划、实收 G 做结算。
- 向游客收的定金/尾款在适用场景下拆成两张 Guest 应收；合作方代收的定金不开地接定金应收。
- 返利为对发客 Partner 的应付，须在发团概览等统计面展示，且不并入结算应收分母；办理无固定系统截止日。

## Testing Seam（已确认）

**单一主 seam：客源单金额与路径编排（Source Order amount / path orchestration）。**

覆盖：录入派生与校验、生成/补建应收与返利应付、按实收结算校正、发团概览返利口径。不新开平行佣金引擎；「按实收结算」作为该 seam 下的用户故事，不另拆 seam。

---

## User Stories

1. As a 计调, I want 在客源单上分别录入定金与尾款, so that 约定代收结构与客户口头账单一致。
2. As a 计调, I want 选择「全部客户结算 / 全部我方代收 / 合作方收定金+我方收尾款」, so that 系统按场景生成正确路径。
3. As a 计调, I want 抽屉预览显示 S、P、G约定、预估客户补款与预计返利, so that 保存前能看懂轧差。
4. As a 计调, I want 文案标明「客户已收（定金）不计入客户补款金额」, so that 不会把 P 当成客户补款应收。
5. As a 计调, I want 当 G约定≥S 时提示不生成客户补款应收, so that 代收已覆盖团款时列表干净。
6. As a 计调, I want 当 G约定>S 时看到预计返利, so that 知道多收部分将付给合作方。
7. As a 计调, I want 允许 P 大于 S, so that 能如实记录合作方大额定金。
8. As a 计调, I want 保存时不再强制 P+G=S, so that 可按收客价录入地接代收。
9. As a 计调, I want 「全部我方代收」生成定金代收与尾款代收两张游客应收, so that 两张账单可分开跟进。
10. As a 计调, I want 「合作方收定金+我方收尾款」只生成尾款代收且不为合作方定金开地接定金应收, so that 钱在合作方处不会误记为地接游客应收。
11. As a 计调, I want 「全部客户结算」不生成游客代收与返利, so that 无地接代收时无返利。
12. As a 财务, I want 客户补款应收金额恒为 max(0,S−G) 而非 P, so that S=5000、P=4500、G=1000 时补款为 4000。
13. As a 财务, I want 仅当 S−G>0 时存在客户补款应收, so that G 已覆盖 S 时无多余客户应收。
14. As a 财务, I want 返利以应付开给发客 Partner 且金额为 max(0,G−S), so that 付款核销走现有应付流程。
15. As a 财务, I want 约定用 G约定预估、实收后用 G实收校正, so that 计划与结算分离。
16. As a 财务, I want 第一版可用人工「按实收结算」触发校正, so that 半收款状态不会自动乱改节点。
17. As a 财务, I want 定金/尾款流水核销到对应游客应收, so that 资金与账款对齐。
18. As a 财务, I want 返利付款流水核销到返利应付, so that 多收不长期只趴在未核销收入。
19. As a 财务, I want 系统不强制出团后 N 天或每周自动出返利付款, so that 可按自有节奏（如周结）办理。
20. As a 计调或财务, I want 发团概览展示返利相关统计, so that 不必钻进应付列表才知道本团返利。
21. As a 计调或财务, I want 返利不计入结算应收分母与客源收款进度, so that 概览进度不被扭曲。
22. As a 财务, I want 全局应付与合作伙伴往来账款能看到返利应付, so that 对账与付款入口统一。
23. As a 计调, I want 单条/批量生成应收时按规则创建适用的客户补款与游客分账节点, so that 不必手工拆单。
24. As a 计调, I want 返利应付与应收生成同属客源路径编排, so that 不会漏建或多建。
25. As a 财务, I want 未 finance-touch 时可按新约定重算路径, so that 录错定金/尾款还能改。
26. As a 财务, I want 已有有效核销时不能静默重算补款/返利, so that 符合有履历后明确调整原则。
27. As an agent/developer, I want 使用 CONTEXT 与 ADR-0033 规范名（返利，非返佣）, so that 文案与领域一致。
28. As a 计调, I want 旧 P+G=S 客源单有兼容或迁移策略, so that 升级后旧团可读可结。
29. As a 产品/财务, I want 往来确认单是否列返利可后置, so that 第一版先闭环系统内账。
30. As a 财务, I want 验收例 S=5000 三组金额正确, so that 与客户确认口径一致。

---

## Implementation Decisions

- **权威决策**：ADR-0033；CONTEXT 词条；部分取代 ADR-0002；修订 ADR-0010。
- **单一 seam**：客源单金额与路径编排（含按实收结算故事）。
- **模块边界**：Departure/客源单负责 S、P、G约定、轧差与路径规格；Finance 拥有收付款节点、流水、核销；Departure finance facade / overviewStats 增加返利口径，不把返利并入结算应收分母（ADR-0020）。
- **公式**：

```text
客户补款 = max(0, S − G)
返利应付 = max(0, G − S)
```

  P 不进公式。全部我方代收：`G约定 = 定金 + 尾款`；分拆：`P = 定金`，`G约定 = 尾款`。G实收 = 归集到本单地接代收路径的收入合计。
- **废除**：强制 P+G=S；客户补款应收=P；以 P≤S 硬拦客户已收。
- **生成规则**：见 ADR-0033 场景表（客户结算 / 全部我方代收 / 分拆）。
- **返利**：对 Partner 应付；无固定截止日；无按周自动出账；第一版可人工「按实收结算」。
- **Schema/API**：客源单持久化定金、尾款（或等价期次）；路径规格支持定金代收、尾款代收、返利应付；概览增加返利聚合。
- **UI**：抽屉分区——团款 / 代收约定 / 往来结果（预估补款与返利）；列表区分定金代收、尾款代收、客户补款、返利。
- **历史数据**：迁移策略实现期另定（只读兼容或批量重算）。

---

## Testing Decisions

- 只测外部行为：给定录入与生成/结算动作，断言节点是否存在、金额、对手方类型、概览聚合；不测内部拆分实现。
- 主模块：客源单金额与路径编排（含按实收结算）。
- 先验：现有客源金额计算、生成应收、发团概览相关 API/e2e 与表驱动金额单测。
- 必过验收例（S=5000）：

| P | G | 返利 | 客户补款 |
|---|---|------|----------|
| 200 | 6000 | 1000 | 0 |
| 4500 | 1000 | 0 | 4000 |
| 4500 | 200 | 0 | 4800 |

- 回归：全部客户结算无返利；合法溢价代收不得再因旧 P+G=S 校验失败。

---

## Out of Scope

- 往来确认单/对外导出强制增加返利列（后置确认）。
- 系统按周或按出团后天数自动生成返利付款。
- 用「定金很小」阈值判断是否开客户补款。
- 返利做成负应收或冲减结算金额。
- 资源应付、拼出等成本侧改造。
- 新建独立佣金/返佣子系统。
- 经济利润展示（客户口袋 ≈ P+返利−补款）作为第一版必做指标（可后置；勿与现金返利 G−S 混淆）。

---

## Further Notes

- 分支：`0727返利功能设计`；Issue：[#187](https://github.com/xiqiuqiu/xiaotuanbao/issues/187)。
- 摘要备忘：[docs/superpowers/specs/2026-07-27-source-order-rebate-collection-design.md](../superpowers/specs/2026-07-27-source-order-rebate-collection-design.md)。
- 客户已收定金 P：业务事实，不是客户补款金额来源。
- 已 finance-touch 的重算限制对齐 ADR-0010 精神。
