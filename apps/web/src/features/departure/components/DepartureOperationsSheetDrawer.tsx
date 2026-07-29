import { useState } from 'react'
import { Alert, Button, Drawer, Empty, Space, message } from 'antd'
import { useQuery } from '@tanstack/react-query'
import type { DepartureOperationsSheetSnapshot } from '@xiaotuanbao/shared'
import {
  downloadDepartureOperationsSheet,
  getDepartureOperationsSheet,
} from '@/services/departure.service'
import {
  OperationsSheetFinanceSection,
  OperationsSheetIncomeRecordsSection,
  OperationsSheetMetaSection,
  OperationsSheetNotesSection,
  OperationsSheetPendingSection,
  OperationsSheetSegmentsSection,
  OperationsSheetSourceOrdersSection,
} from './OperationsSheetSections'

interface DepartureOperationsSheetDrawerProps {
  open: boolean
  departureId: string
  onClose: () => void
}

export function DepartureOperationsSheetDrawer({
  open,
  departureId,
  onClose,
}: DepartureOperationsSheetDrawerProps) {
  const [exporting, setExporting] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['departure-operations-sheet', departureId],
    queryFn: () => getDepartureOperationsSheet(departureId),
    enabled: open,
  })

  async function handleExport() {
    setExporting(true)
    try {
      await downloadDepartureOperationsSheet(departureId)
      message.success('已开始下载 Excel')
    } catch {
      // downloadBinary already surfaces the error message
    } finally {
      setExporting(false)
    }
  }

  return (
    <Drawer
      title="发团运营表"
      placement="right"
      size="min(960px, 100vw)"
      open={open}
      onClose={onClose}
      destroyOnHidden
      loading={isLoading}
      extra={
        <Button type="primary" loading={exporting} disabled={!data || isError} onClick={handleExport}>
          导出 Excel
        </Button>
      }
    >
      {isError ? (
        <Alert
          type="error"
          showIcon
          title="加载失败"
          description={error instanceof Error ? error.message : '无法加载发团运营表'}
        />
      ) : null}

      {!isLoading && !isError && !data ? <Empty description="暂无数据" /> : null}

      {data ? <OperationsSheetContent sheet={data} /> : null}
    </Drawer>
  )
}

function OperationsSheetContent({ sheet }: { sheet: DepartureOperationsSheetSnapshot }) {
  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <OperationsSheetMetaSection sheet={sheet} />
      <OperationsSheetSourceOrdersSection sheet={sheet} />
      <OperationsSheetSegmentsSection sheet={sheet} />
      <OperationsSheetIncomeRecordsSection sheet={sheet} />
      <OperationsSheetPendingSection sheet={sheet} />
      <OperationsSheetFinanceSection sheet={sheet} />
      <OperationsSheetNotesSection sheet={sheet} />
    </Space>
  )
}
