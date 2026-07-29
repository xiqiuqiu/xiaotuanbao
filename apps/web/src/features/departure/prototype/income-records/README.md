# PROTOTYPE — 团内增收记录 UI

> Throwaway. Answers one question, then gets folded or discarded.

## Question

团内增收记录页签应以何种**信息架构**呈现？

| Key | 方案 | 主路径 |
|---|---|---|
| A | 统计 + 表格 + 抽屉 | 扫全表、完整字段、与现有后台密度一致 |
| B | 结算泳道推进 | 按综合结算态跟进「标记已收 / 已付」 |
| C | 类型优先录入台 | 计调先选类型，再登一笔 |

PRD：`ider/团内增收记录功能_PRD.md`

## Run

```bash
pnpm prototype:income-records
```

然后登录任意发团详情，打开页签 **增收记录**，或直接访问：

```
http://localhost:5173/departure/<departureId>?tab=incomeRecords&variant=A
```

- 底部黑色切换条 / 键盘 ← → 切换 A|B|C
- 数据为内存 stub，刷新重置
- 生产构建不展示该页签与切换条
