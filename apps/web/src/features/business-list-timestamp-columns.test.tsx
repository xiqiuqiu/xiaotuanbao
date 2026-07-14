import { describe, expect, it, vi } from 'vitest'
import type { ColumnsType } from 'antd/es/table'
import { buildEmployeeColumns } from '@/pages/system/EmployeesPage'
import { buildPartnerColumns } from '@/features/partner/pages/PartnersPage'
import { buildSupplierColumns } from '@/features/supplier/pages/SuppliersPage'
import { buildDepartureColumns } from '@/features/departure/pages/DeparturesPage'
import { buildPaymentScheduleColumns } from '@/features/finance/components/payment-schedule-table-columns'
import { buildTransactionColumns } from '@/features/finance/components/transaction-table-columns'
import { buildVerificationColumns } from '@/features/finance/components/verification-table-columns'

function titles<T>(columns: ColumnsType<T>): string[] {
  return columns.map((column) => String(column.title))
}

function expectTimestampsBeforeActions(columnTitles: string[]) {
  expect(columnTitles.slice(-3)).toEqual(['创建时间', '更新时间', '操作'])
}

const noop = vi.fn()

describe('业务主列表时间列', () => {
  it('员工、合作伙伴、供应商和发团在操作列前显示创建及更新时间', () => {
    expectTimestampsBeforeActions(titles(buildEmployeeColumns(noop, noop)))
    expectTimestampsBeforeActions(titles(buildPartnerColumns(false, noop, noop, noop)))
    expectTimestampsBeforeActions(titles(buildSupplierColumns(false, noop, noop, noop)))
    expectTimestampsBeforeActions(titles(buildDepartureColumns(vi.fn())))
  })

  it('顶层财务列表显示两列，发团详情内嵌列表不显示', () => {
    const scheduleOptions = {
      isReceivable: true,
      readOnly: false,
      departureMap: new Map<string, { departureNo: string; name: string }>(),
      onConfirm: noop,
      onVerify: noop,
      onEdit: noop,
      onCancel: noop,
      onReopen: noop,
      onAdjustAmount: noop,
      onViewDetail: noop,
      onViewVerifications: noop,
    }
    const transactionOptions = {
      readOnly: false,
      onOpenDetail: noop,
      onOpenVerify: noop,
      onEdit: noop,
      onOpenVoidModal: noop,
      onViewVerifications: noop,
    }
    const verificationOptions = {
      readOnly: false,
      onOpenDetail: noop,
      onOpenCancelModal: noop,
    }

    expectTimestampsBeforeActions(
      titles(buildPaymentScheduleColumns({ ...scheduleOptions, isDepartureScope: false })),
    )
    expectTimestampsBeforeActions(
      titles(buildTransactionColumns({ ...transactionOptions, isDepartureScope: false })),
    )
    expectTimestampsBeforeActions(
      titles(buildVerificationColumns({ ...verificationOptions, isDepartureScope: false })),
    )

    for (const columnTitles of [
      titles(buildPaymentScheduleColumns({ ...scheduleOptions, isDepartureScope: true })),
      titles(buildTransactionColumns({ ...transactionOptions, isDepartureScope: true })),
      titles(buildVerificationColumns({ ...verificationOptions, isDepartureScope: true })),
    ]) {
      expect(columnTitles).not.toContain('创建时间')
      expect(columnTitles).not.toContain('更新时间')
    }
  })
})
