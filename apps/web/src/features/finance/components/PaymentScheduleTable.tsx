import { Card, Table } from 'antd'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { matchesLocateTarget } from '../hooks/usePaymentScheduleLocate'
import { buildPaymentScheduleColumns } from './payment-schedule-table-columns'
import styles from './PaymentScheduleWorkspace.module.css'

export interface PaymentScheduleTableProps {
  loading: boolean
  columns: ReturnType<typeof buildPaymentScheduleColumns>
  items: PaymentScheduleSummary[]
  page: number
  pageSize: number
  total: number
  locateSourceOrderId?: string
  locateSegmentResourceId?: string
  locateFlashActive: boolean
  locateBg: string
  onPageChange: (page: number, pageSize: number) => void
}

export function PaymentScheduleTable({
  loading,
  columns,
  items,
  page,
  pageSize,
  total,
  locateSourceOrderId,
  locateSegmentResourceId,
  locateFlashActive,
  locateBg,
  onPageChange,
}: PaymentScheduleTableProps) {
  return (
    <Card>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        style={{ ['--schedule-locate-bg' as string]: locateBg }}
        rowClassName={(record) =>
          locateFlashActive &&
          matchesLocateTarget(record, locateSourceOrderId, locateSegmentResourceId)
            ? styles.locateFlash
            : ''
        }
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count) => `共 ${count} 条`,
          onChange: onPageChange,
        }}
      />
    </Card>
  )
}
