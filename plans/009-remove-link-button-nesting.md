# 009 — 移除 Link 包 Button 的交互嵌套

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Rule**: custom/no-nested-interactive-controls
- **Estimated scope**: 7 source files plus 4 focused tests, about 180 lines

## Problem

项目有 13 处 TanStack `Link`（渲染为 `<a>`）包住 Ant Design `Button`（渲染为 `<button>`），产生非法的 `<a><button /></a>`、重复焦点与不稳定的键盘/读屏语义。例如：

    // apps/web/src/features/departure/pages/DeparturesPage.tsx:219 — current
    <Link to="/departure/new" search={{ copyFrom: record.id }}>
      <Button type="link" size="small" icon={<CopyOutlined />}>
        复制
      </Button>
    </Link>

    // apps/web/src/features/departure/components/DepartureHeaderCard.tsx:31 — current
    <Link to="/departure">
      <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }}>
        返回发团列表
      </Button>
    </Link>

同型位置：`DeparturesPage.tsx:307`、`CreateDepartureWizard.tsx:149,202`、`PartnerDetailPage.tsx:56,79,96`、`SupplierDetailPage.tsx:61,84,101`、`HomePage.tsx:11`、`NotFoundPage.tsx:11`。

## Target

每个视觉控件只保留一个真实 button，并通过 `useNavigate` 完成客户端导航；不得改成裸 `window.location`。

    // simple component target
    const navigate = useNavigate()

    <Button
      type="text"
      icon={<ArrowLeftOutlined />}
      style={{ paddingLeft: 0, marginBottom: 16 }}
      onClick={() => void navigate({ to: '/departure' })}
    >
      返回发团列表
    </Button>

`DeparturesPage` 的列 builder 接收显式回调，避免在普通函数中调用 hook：

    // apps/web/src/features/departure/pages/DeparturesPage.tsx — target
    export function buildDepartureColumns(
      onCopy: (departureId: string) => void,
    ): ColumnsType<DepartureSummary> {
      // ...
      render: (_value, record) => (
        <Button
          type="link"
          size="small"
          icon={<CopyOutlined />}
          onClick={() => onCopy(record.id)}
        >
          复制
        </Button>
      )
    }

    export function DeparturesPage() {
      const navigate = useNavigate()
      const handleCopy = useCallback(
        (departureId: string) => {
          void navigate({ to: '/departure/new', search: { copyFrom: departureId } })
        },
        [navigate],
      )
      const columns = useMemo(() => buildDepartureColumns(handleCopy), [handleCopy])

      // PageHeader action target
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => void navigate({ to: '/departure/new' })}
      >
        新建发团
      </Button>
    }

在 `PartnerDetailPage`、`SupplierDetailPage`、`CreateDepartureWizard`、`DepartureHeaderCard`、`HomePage`、`NotFoundPage` 使用相同 `useNavigate` pattern。三个详情页的 loading/error/success 分支复用同一个局部 `goBack` 回调，不复制不同导航逻辑。`CreateDepartureWizard` 的 footer“返回”和 header“返回发团列表”共用 `goBack`。

## Repo conventions to follow

- `apps/web/src/layouts/MainLayout.tsx:100` 已用 `navigate({ to: key })` 驱动 AntD Menu，是 Button 导航的仓库范例。
- `TransactionsWorkspace.tsx:87` 展示带 params/search 的 `void navigate({...})`。
- `PartnerDetailPage.test.tsx:64` 已按可访问角色检查返回入口；更新为 `getByRole('button', { name: /返回合作伙伴列表/ })` 并断言 navigate mock。
- 仅替换 Link 包 Button；主字段链接（如团号/团名）继续使用语义正确的 `Link`。

## Steps

1. 对上述 9 个文件逐一移除仅用于包 Button 的 `Link` import/JSX，并按 Target 引入 `useNavigate`；保留仍用于纯文本链接的 import。
2. 修改 `buildDepartureColumns` 接收 `onCopy`，在 `DeparturesPage` 用 memoized callback 传入；页头新建按钮使用同一 navigate。
3. 在 partner/supplier/departure header/wizard 中建立稳定 `goBack`；所有渲染分支调用它。
4. Home/NotFound 的 Result extra 改为单一 Button + navigate。
5. 更新 `PartnerDetailPage.test.tsx`、`SupplierDetailPage.test.tsx`、`CreateDepartureWizard.test.tsx`；至少新增一个 `DeparturesPage` 列测试，断言 DOM 不存在 `a button`，点击后收到精确 `to/search`。
6. 运行 `rg -U '<Link[\\s\\S]{0,240}?<Button' apps/web/src --glob '*.tsx'`，结果必须为空；保留纯 Link。

## Boundaries

- 不把客户端导航换成 `window.location` 或普通 `<a href>`，不改变 history/search/params。
- 不改按钮 type、icon、文案、间距或主操作数量。
- 不重构 PageHeader、Result 或详情页数据逻辑。
- 不处理非 `Link > Button` 的其他链接样式。
- 若代码偏离 commit `b77379c`，停止并报告。

## Verification

- **Mechanical**:
  - `pnpm --filter @xiaotuanbao/web test -- PartnerDetailPage SupplierDetailPage CreateDepartureWizard DeparturesPage`
  - `pnpm --filter @xiaotuanbao/web typecheck && pnpm --filter @xiaotuanbao/web lint`
  - 全量 `pnpm --filter @xiaotuanbao/web test`
  - 上述 `rg -U` 无命中；`npx react-doctor@latest --scope changed` 清除诊断且分数不下降。
- **Behavior check**: 键盘 Tab 检查首页/404 主按钮、发团页新建与复制、创建页两个返回入口、合作伙伴/供应商/发团详情返回；每处只有一个焦点，Enter 只导航一次，目标 route/search 与修改前一致。Highlight updates 不应出现一次激活触发两次导航渲染。
- **Done when**: 源码无 Link 包 Button，全部 13 处导航保持 SPA 行为和视觉，测试通过。
