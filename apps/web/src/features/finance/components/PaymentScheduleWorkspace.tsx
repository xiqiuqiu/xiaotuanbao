import { PaymentScheduleFilters } from './PaymentScheduleFilters'
import { PaymentScheduleActionDialogs } from './PaymentScheduleActionDialogs'
import { PaymentScheduleDetailDrawer } from './PaymentScheduleDetailDrawer'
import { PaymentScheduleTable } from './PaymentScheduleTable'
import { usePaymentScheduleWorkspace } from '../hooks/usePaymentScheduleWorkspace'

export type PaymentScheduleWorkspaceProps = {
  scope: 'global' | 'departure'
  direction: 'receivable' | 'payable'
  departureId?: string
  readOnly?: boolean
  /** One-shot locate: flash rows for this source order, then clear via onHighlightConsumed. */
  highlightSourceOrderId?: string
  /** One-shot locate: flash rows for this segment resource, then clear via onHighlightConsumed. */
  highlightSegmentResourceId?: string
  onHighlightConsumed?: () => void
}

export function PaymentScheduleWorkspace(props: PaymentScheduleWorkspaceProps) {
  const {
    isReceivable,
    isDepartureScope,
    effectiveDepartureId,
    statusFilter,
    keyword,
    dueDateRange,
    page,
    pageSize,
    setPage,
    setPageSize,
    setDepartureFilter,
    setStatusFilter,
    setKeyword,
    setDueDateRange,
    resetFilters,
    scope,
    isLoading,
    columns,
    tableItems,
    tableTotal,
    locateSourceOrderId,
    locateSegmentResourceId,
    locateFlashActive,
    locateBg,
    dialogs,
    departureMap,
    lockedDepartureId,
    confirmMutation,
    verifyCreateMutation,
    cancelMutation,
    reopenMutation,
    adjustMutation,
    editMutation,
  } = usePaymentScheduleWorkspace(props)

  return (
    <div>
      <PaymentScheduleFilters
        departureId={effectiveDepartureId}
        statusFilter={statusFilter}
        keyword={keyword}
        dueDateRange={dueDateRange}
        showDepartureFilter={scope === 'global'}
        onDepartureChange={(value) => {
          setDepartureFilter(value)
          setPage(1)
        }}
        onStatusChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        onDueDateRangeChange={(value) => {
          setDueDateRange(value)
          setPage(1)
        }}
        onReset={resetFilters}
      />

      <PaymentScheduleTable
        loading={isLoading}
        columns={columns}
        items={tableItems}
        page={page}
        pageSize={pageSize}
        total={tableTotal}
        locateSourceOrderId={locateSourceOrderId}
        locateSegmentResourceId={locateSegmentResourceId}
        locateFlashActive={locateFlashActive}
        locateBg={locateBg}
        onPageChange={(nextPage, nextPageSize) => {
          setPage(nextPage)
          setPageSize(nextPageSize)
        }}
      />

      <PaymentScheduleActionDialogs
        isReceivable={isReceivable}
        activeSchedule={dialogs.activeSchedule}
        departureMap={departureMap}
        lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
        confirmOpen={dialogs.confirmOpen}
        verifyOpen={dialogs.verifyOpen}
        cancelOpen={dialogs.cancelOpen}
        reopenOpen={dialogs.reopenOpen}
        adjustOpen={dialogs.adjustOpen}
        editOpen={dialogs.editOpen}
        confirmForm={dialogs.confirmForm}
        verifyForm={dialogs.verifyForm}
        cancelForm={dialogs.cancelForm}
        reopenForm={dialogs.reopenForm}
        adjustForm={dialogs.adjustForm}
        editForm={dialogs.editForm}
        confirmMutation={confirmMutation}
        verifyCreateMutation={verifyCreateMutation}
        cancelMutation={cancelMutation}
        reopenMutation={reopenMutation}
        adjustMutation={adjustMutation}
        editMutation={editMutation}
        onCloseConfirm={dialogs.closeConfirm}
        onCloseVerify={dialogs.closeVerify}
        onCloseCancel={dialogs.closeCancel}
        onCloseReopen={dialogs.closeReopen}
        onCloseAdjust={dialogs.closeAdjust}
        onCloseEdit={dialogs.closeEdit}
      />

      <PaymentScheduleDetailDrawer
        open={dialogs.detailOpen}
        scheduleId={dialogs.detailScheduleId}
        isReceivable={isReceivable}
        onClose={dialogs.closeDetail}
      />
    </div>
  )
}
