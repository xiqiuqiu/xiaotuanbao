# PRD：客源管理一览（方案 A）— 原型处置

**状态**：方案 A 已落地（[#250](https://github.com/xiqiuqiu/xiaotuanbao/issues/250)、[#251](https://github.com/xiqiuqiu/xiaotuanbao/issues/251)）；原型沙盒拆除护栏（[#252](https://github.com/xiqiuqiu/xiaotuanbao/issues/252)）  
**Menu Key**：`/departure`（发团详情 → 客源管理 Tab）  
**权威 Spec**：[#249](https://github.com/xiqiuqiu/xiaotuanbao/issues/249)（方案 A 产品决策与验收全文）  
**壳背景**：[departure-detail-layout-variant-d.zh-CN.md](./departure-detail-layout-variant-d.zh-CN.md)  
**原型指针（primary source，非生产依赖）**：Spec [#249](https://github.com/xiqiuqiu/xiaotuanbao/issues/249) / 分支 `0730客源单调优`（沙盒曾规划为 `/prototype/source-orders-list?variant=A`，脚本曾规划为 `pnpm prototype:source-orders-list`）。主站不挂载该沙盒、PrototypeSwitcher 或 `?variant=` 方案切换；只保留方案 A。

---

## 原型处置（#252，对照 #243）

主站本无客源一览 throwaway 沙盒合入。本票确认并护栏：

1. 无 `/prototype/source-orders-list` 路由。  
2. 无为本功能引入的 `PrototypeSwitcher` 生产挂载；根 `package.json` 无 `prototype:source-orders-list`。  
3. 发团详情 `validateSearch` 不透传 `variant`；正式客源 Tab / 详情壳在 `?variant=` 下仍走生产路径。  
4. 既有 `SourceOrdersTab.no-prototype`（#227）与发团详情 no-prototype（#243）继续作为回归护栏。

业务 UI（名单列、列序、结算汇总条）与页头折叠属 #250 / #251，不在本票改动范围。
