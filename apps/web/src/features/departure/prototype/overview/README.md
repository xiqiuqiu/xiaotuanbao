# PROTOTYPE · 发团详情概览

> Throwaway. 回答视觉问题后收口到正式组件，本目录迁到 throwaway 分支。

## Question

概览如何更清晰地呈现经营与资金进度，避免空态扁平、主次不清？

| Key | 方案 |
|-----|------|
| prod | 正式概览（对照） |
| A | 强化主指标带：四格连成 KPI，数字更大 |
| B | 损益纵轴 + 进度环：左瀑布、右三环 |
| C | 报表清单：单张白纸分组行，无卡片 |

## Run

```bash
pnpm prototype:departure-overview
```

打开任意发团详情概览 Tab：底部黑色条切换。或手拼（注意 **`&variant=A`**）：

`/departure/<id>?tab=overview&variant=A`
