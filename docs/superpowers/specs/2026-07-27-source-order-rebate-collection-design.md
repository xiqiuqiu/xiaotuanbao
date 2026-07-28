# 返利与代收业务规则

日期：2026-07-27  
状态：已定稿 PRD + ADR-0033（proposed）+ grilling 边界补钉

- **PRD（完整）**：[docs/prd/source-order-rebate-collection.zh-CN.md](../../prd/source-order-rebate-collection.zh-CN.md)
- **ADR**：[docs/adr/0033-source-order-rebate-and-split-collection.md](../../adr/0033-source-order-rebate-and-split-collection.md)
- **Issue**：[#187](https://github.com/xiqiuqiu/xiaotuanbao/issues/187)

## 六问定稿

| # | 结论 |
|---|------|
| 1 | 补款=`max(0,S−G)`，返利=`max(0,G−S)`；**P 不进公式** |
| 2 | 约定预估 + **实收结算** |
| 3 | 录单分别录 **S + 定金 + 尾款** |
| 4 | 定金代收、尾款代收 **两张应收**（向游客收；合作方代收定金不开地接定金应收） |
| 5 | 仅当 `S−G>0` 开客户补款，金额=`S−G` |
| 6 | 返利=对合作方应付；概览要展示；时机自定，常见尾款齐后 |

## Grilling 补钉

| 项 | 结论 |
|----|------|
| G实收 | 仅已核销到定金/尾款节点 |
| 落账 | 生成应收：Guest +（S−G约定>0 时）补款；返利仍齐账后按 G实收 |
| 结算门槛 | 代收结清后自动校正补款/落返利；不提供提前入口；finance-touch 后不静默重算 |
| 确认单 | 押金列=P；补款单独列；返利列后置 |
| 历史 | 开发阶段破坏性重建，无旧口径双轨 |
| 硬拦 | 非负；代收 G约定>0 |
| 概览 | 团款/代收进度拆卡；团款分子=`min(Guest已收,S)+补款已收` |

## 验收例（S=5000）

| P | G | 返利 | 客户补款 |
|---|---|------|----------|
| 200 | 6000 | 1000 | 0 |
| 4500 | 1000 | 0 | 4000 |
| 4500 | 200 | 0 | 4800 |
