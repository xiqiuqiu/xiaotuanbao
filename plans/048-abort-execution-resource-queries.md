# 048 — 执行资源查询 Abort + 选中段预取

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: LOW
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 2–3 files

## Problem

`listSegmentResources` 无 signal；快切行程段可能重叠请求。段→资源固有串行瀑布。

## Target

1. `listSegmentResources(segmentId, params, signal?)`。
2. `ExecutionResourcePane` `queryFn: ({ signal }) => listSegmentResources(segment.id, {}, signal)`。
3. `ExecutionTab` 在 `selectedSegmentId` 已知时 `prefetchQuery` 同 key（缩短切回缓存段的等待）。可选：`listSegments` 也接 signal。

## Verification

- typecheck；快切段 Network 见 cancelled；切回已访问段命中缓存。
