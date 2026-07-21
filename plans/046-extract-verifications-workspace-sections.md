# 046 — 拆分 VerificationsWorkspace

- **Status**: DONE
- **Commit**: 2f24597
- **Severity**: MEDIUM
- **Category**: Maintainability & architecture
- **Rule**: react-doctor/no-giant-component
- **Estimated scope**: 2–4 files

## Problem

`VerificationsWorkspace` 主导出 >300 行（`:206`），Doctor 报警。

Canonical：Pull each section into its own component so the parent is easier to read, test, and change.

## Target

Exemplar：037 TransactionsWorkspace 拆分。建议：

1. 将 `VerificationTable` / `VerificationListContent` / `VerificationWorkspaceFilters` / `CreateVerificationButton` 移到 `verification-workspace-sections.tsx`（或同目录多文件）。
2. 可选：`useVerificationsWorkspaceQuery` 抽 list query + placeholder。

目标：`VerificationsWorkspace.tsx` 主导出函数 <300 行，清除 `no-giant-component`。

## Boundaries

- 行为保持；不改深链/筛选/错误态语义。

## Verification

- `npx react-doctor@latest --scope changed` 清除该诊断；finance verification 相关测试绿。
