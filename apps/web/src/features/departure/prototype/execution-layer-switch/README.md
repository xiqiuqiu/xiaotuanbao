# 执行安排 · 资源层级切换 UI 原型

> **问题**：「按日资源 / 发团级资源」切换条与顶栏 Tab、日程轴的色彩/层次不够和谐——出 4 种结构方案对比。

## 启动

```bash
pnpm prototype:execution-layer-switch
```

浏览器（需已登录）：

http://localhost:5173/prototype/execution-layer-switch

## 方案

| 键 | 结构 |
|---|---|
| **A** | 全宽 Segmented 轨道（当前生产方向） |
| **B** | 线型 Tab，无独立灰底条 |
| **C** | 紧凑工具条：左说明 + 右 Radio 实心按钮 |
| **D** | 切换器并入内容 Card 页眉 |

切换：`?variant=A|B|C|D`，或底部浮动条 / ← →。

## 丢弃

定稿后把选中方案重写进 `ExecutionTab.tsx` / `ExecutionTab.module.css`，勿直接 import 本目录。
