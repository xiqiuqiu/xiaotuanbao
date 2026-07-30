# PROTOTYPE — 发团详情导航 + 执行安排布局

> Throwaway. Answers one question, then gets folded or discarded.

## Question

1. 发团详情里「概览 / 客源 / 增收 / 应收 / 应付…」这些 Tab **放哪里**更便于操作？
2. 执行安排如何布局：**发团级资源**（全程统一录入）与 **按日资源**（酒店、门票）互不抢空间？

| Key | 方案 | 导航 | 执行安排 |
|---|---|---|---|
| A | 顶栏页签 · 全程伪日段 | 横向 Tabs（业务/财务同级） | 左侧日轨第一项=「全程资源」；选日只看当日 |
| B | 两级导航 · 横向日程轴 | 先业务/财务，再组内胶囊 | 发团级顶部折叠条；日程横向轴；主区仅当日 |
| C | 图标轨 · 种类×日期矩阵 | 窄图标轨 | 发团级顶条 + 酒店/门票矩阵 |
| **D** | **混搭（倾向方案）** | **A：顶栏 Tabs** | **B：发团级折叠条 + 横向日程轴** |

## Run

```bash
pnpm prototype:departure-detail-layout
```

**免登录沙盒（推荐，无需 API）：**

```
http://localhost:5173/prototype/departure-detail-layout?tab=execution&variant=D
```

也可挂到真实发团详情（需登录）：

```
http://localhost:5173/departure/<departureId>?tab=execution&variant=D
```

- 底部黑色切换条 / 键盘 ← → 切换 A|B|C|D
- 数据为内存 stub，刷新重置
- 生产构建忽略 `variant`，独立路由页亦提示不可用
