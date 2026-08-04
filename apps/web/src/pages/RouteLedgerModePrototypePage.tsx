import { Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { PageHeader } from '@/layouts/PageHeader'
import { RouteLedgerModePrototypeHost } from '@/features/departure/prototype/route-ledger-mode/RouteLedgerModePrototypeHost'

/** PROTOTYPE page — 线路视图收入/成本模式定稿预览。 */
export function RouteLedgerModePrototypePage() {
  return (
    <>
      <PageHeader
        title="发团管理"
        action={
          <Button type="primary" icon={<PlusOutlined />}>
            新建发团
          </Button>
        }
      />
      <RouteLedgerModePrototypeHost />
    </>
  )
}
