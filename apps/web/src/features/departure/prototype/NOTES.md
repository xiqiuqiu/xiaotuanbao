# Execution arrangement IA prototype

**Question (resolved):** 发团详情里行程段与段内资源，第一版应采用哪种页面结构？

**Verdict:** **主从同屏**；详情 Tab 名 **「执行安排」**；进入时默认选中第一段（或 URL `segmentId`）。

**Layout verdict:** **左窄行程段列表 + 右资源主表**（方案 A）。曾试「上段下资源」双表过挤、「顶部分段条」后改选左侧导航。段 CRUD 用抽屉。

**Current prototype question:** 执行安排顶部汇总条第一版展示什么？

| Key | Name |
|---|---|
| A | 沿用全团汇总（段数/天数/资源/应付 + 添加行程段） |
| B | 全团汇总 + 当前段上下文（推荐默认） |
| C | 双主按钮（添加行程段 / 添加资源） |
| D | 极简汇总，操作下沉到各区 |

**URL:** `/prototype/execution-arrangement?variant=B`

**Summary-bar verdict:** **D — 极简汇总**，指标取 **段数 · 资源项 · 应付概况**

- 示例：`2 段 · 5 项资源 · 应付部分生成`
- 不堆当前段长上下文、不放双主按钮。
- 「添加行程段」落在左侧段区（+ 无段时右侧 Empty）；「添加资源」落在右侧资源区标题栏。
- 当前段上下文由左侧选中态 + 右侧资源区副文案承担。

**Docs organization:** `执行安排功能设计.md` 为总览；`资源安排功能设计.md` 专写资源与应付细则。

**URL / Tab cutover:** 一次改为新方案（Tab「执行安排」+ key `execution`），**不写**旧 `segments`/`resources` 兼容；开发环境可接受重建。选段同步 `segmentId`；删除当前段后选下一段（否则上一段 / 空态）。

**Left nav:** 精简（名称、短日期、目的地、模板标签、资源概况）；按开始日期升序；仅编辑图标，删除在抽屉。

**Resource pane:** 第一版不做筛选；「添加资源」在右侧标题栏；无段时右侧 Empty 也可「添加行程段」。
