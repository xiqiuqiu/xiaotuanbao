import { describe, expect, it, vi } from 'vitest'
import type { ColumnsType } from 'antd/es/table'
import type { UseMutationResult } from '@tanstack/react-query'
import { buildEmployeeColumns } from '@/pages/system/employees/employee-columns'
import { buildPartnerColumns } from '@/features/partner/pages/partner-columns'
import { buildSupplierColumns } from '@/features/supplier/pages/supplier-columns'
import { buildDepartureColumns } from '@/features/departure/pages/departure-columns'
import { buildSourceOrdersColumns } from '@/features/departure/components/source-orders-table-columns'
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

function stubMutation(): UseMutationResult<unknown, Error, string, unknown> {
  return {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  } as unknown as UseMutationResult<unknown, Error, string, unknown>
}

describe('业务列表时间列', () => {
  it('员工、合作伙伴、供应商和发团在操作列前显示创建及更新时间', () => {
    expectTimestampsBeforeActions(titles(buildEmployeeColumns(noop, noop)))
    expectTimestampsBeforeActions(titles(buildPartnerColumns(false, noop, noop, noop, true)))
    expectTimestampsBeforeActions(titles(buildSupplierColumns(false, noop, noop, noop, true)))
    expectTimestampsBeforeActions(
      titles(buildDepartureColumns({ onCopy: vi.fn(), onPurge: vi.fn() }, true)),
    )
  })

  it('发团详情客源单列表在操作列前显示创建及更新时间', () => {
    expectTimestampsBeforeActions(
      titles(
        buildSourceOrdersColumns({
          canEdit: true,
          canGenerate: true,
          deleteMutation: stubMutation(),
          generateMutation: stubMutation(),
          onOpen: noop,
          onViewReceivables: noop,
          onViewRebate: noop,
        }),
      ),
    )
  })

  it('顶层与发团详情内嵌财务列表均在操作列前显示创建及更新时间', () => {
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

    for (const isDepartureScope of [false, true]) {
      expectTimestampsBeforeActions(
        titles(buildPaymentScheduleColumns({ ...scheduleOptions, isDepartureScope })),
      )
      expectTimestampsBeforeActions(
        titles(buildTransactionColumns({ ...transactionOptions, isDepartureScope })),
      )
      expectTimestampsBeforeActions(
        titles(buildVerificationColumns({ ...verificationOptions, isDepartureScope })),
      )
    }

    for (const columnTitles of [
      titles(buildPaymentScheduleColumns({ ...scheduleOptions, isDepartureScope: true })),
      titles(buildTransactionColumns({ ...transactionOptions, isDepartureScope: true })),
      titles(buildVerificationColumns({ ...verificationOptions, isDepartureScope: true })),
    ]) {
      expect(columnTitles).not.toContain('关联发团')
    }
  })
})
