# 019 — Partner 详情 Tabs 加 destroyOnHidden 避免隐藏页 eager 拉数

- **Status**: DONE
- **Commit**: a712d4a
- **Severity**: MEDIUM
- **Category**: Performance
- **Rule**: Beyond the scan
- **Estimated scope**: 1 文件（`PartnerDetailPage.tsx`），1 行属性

## Problem

Partner 详情的 `Tabs` 未设 `destroyOnHidden`，三个 Tab 的子树在默认「基本信息」页即**全部挂载**：

```113:131:apps/web/src/features/partner/pages/PartnerDetailPage.tsx
        <Tabs
          items={[
            { key: 'profile', label: '基本信息', children: <PartnerReadonlySections partner={partner} /> },
            { key: 'accounts', label: '往来账款', children: <PartnerLedgerPanel partnerId={partner.id} /> },
            { key: 'groups', label: '合作团单', children: <PartnerSourceOrdersTab partner={partner} /> },
          ]}
        />
```

`PartnerLedgerPanel` 会跑 `usePaymentScheduleWorkspace`（应收列表 + `listFinanceDepartureOptions` + 汇总卡查询），`PartnerSourceOrdersTab` 会跑 `listPartnerSourceOrders`。即便用户只看「基本信息」，也会并发触发约 3–5 个请求。

同仓库 `DepartureDetailPage` 已用 `destroyOnHidden` 处理相同问题（见下方 exemplar）。

**用户影响：** 每次打开 Partner 详情都产生隐藏页的无谓网络与渲染；合作方多、往来账款多时更明显。

## Target

    // target — apps/web/src/features/partner/pages/PartnerDetailPage.tsx:113
    <Tabs
      destroyOnHidden
      items={[
        ...
      ]}
    />

## Repo conventions to follow

- 直接照抄发团详情的用法（antd v6 属性名 `destroyOnHidden`）：

```apps/web/src/features/departure/pages/DepartureDetailPage.tsx
        <Tabs
          ...
          destroyOnHidden
```

（在 `DepartureDetailPage.tsx` 搜索 `destroyOnHidden` 确认当前写法后照抄。）

## Steps

1. 在 `PartnerDetailPage.tsx:113` 的 `<Tabs>` 上新增 `destroyOnHidden` 属性。
2. 若该 `Tabs` 使用受控 `activeKey`/`defaultActiveKey`，确认切换回已访问 Tab 时按预期重新拉取（destroyOnHidden 会在离开时卸载、返回时重挂）。若无受控 key，保持默认。
3. 复查 diff，仅此属性。

## Boundaries

- 不改三个子组件内部逻辑与查询。
- 不改 Tab 顺序、默认页。
- 不新增依赖。

## Verification

- **Mechanical**:
  - `cd apps/web && pnpm test -- PartnerDetailPage` 通过；`pnpm typecheck`。
  - `npx react-doctor@latest --scope changed` 分数不降。
- **Behavior check**（性能，需 Network 面板）：打开某 Partner 详情、停留「基本信息」——Network **不应**出现往来账款/合作团单相关请求（`listPartnerSourceOrders`、应收列表、汇总卡）；点「往来账款」后才发起对应请求；来回切 Tab 功能正常、数据正确。用 React DevTools「Highlight updates」确认默认页不再挂载隐藏子树。
- **Done when**：隐藏 Tab 不再 eager 拉数，切换功能正常，测试/类型通过，分数不降。
