import { Alert, Button } from 'antd'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { CollapsibleFilterBar } from '@/components/CollapsibleFilterBar'
import { listSoftFetchingClassName } from '@/lib/query/list-query-ux'
import { PageHeader } from '@/layouts/PageHeader'
import {
  PaymentScheduleFilters,
  type DepartureDateRange,
} from './PaymentScheduleFilters'
import { PaymentScheduleActionDialogs } from './PaymentScheduleActionDialogs'
import { PaymentScheduleDetailDrawer } from './PaymentScheduleDetailDrawer'
import { PaymentScheduleTable } from './PaymentScheduleTable'
import { usePaymentScheduleWorkspace } from '../hooks/usePaymentScheduleWorkspace'

export type PaymentScheduleWorkspaceProps = {
  scope: 'global' | 'departure' | 'partner' | 'supplier'
  direction: 'receivable' | 'payable'
  departureId?: string
  /** Partner 维度精确过滤（scope='partner' 时必传），同名 Partner 不串。 */
  partnerId?: string
  /** Supplier 维度精确过滤（scope='supplier' 时必传），同名 Supplier 不串。 */
  supplierId?: string
  readOnly?: boolean
  /** One-shot locate: flash rows for this source order, then clear via onHighlightConsumed. */
  highlightSourceOrderId?: string
  /** One-shot locate: flash rows for this segment resource, then clear via onHighlightConsumed. */
  highlightSegmentResourceId?: string
  /** Prefill 往来对象关键字（如从「查看应收 / 查看应付」带入）。 */
  initialCounterpartyKeyword?: string
  onHighlightConsumed?: () => void
  /** When set, renders the standard list page header. */
  pageHeader?: {
    title: string
  }
  /**
   * 汇总卡插槽：渲染在筛选区与列表之间，跟随出团日期筛选
   * （Partner 往来账款 Tab 每方向三项汇总卡）。
   */
  renderSummary?: (filters: {
    departureDateFrom?: string
    departureDateTo?: string
  }) => React.ReactNode
  /** 受控出团日期（跨应收/应付共用时由父级持有）。 */
  departureDateRange?: DepartureDateRange
  onDepartureDateRangeChange?: (value: DepartureDateRange) => void
  /** 出团日期已上提到父级时隐藏筛选项内的 RangePicker。 */
  hideDepartureDateFilter?: boolean
  /**
   * Partner 往来账款：次要筛选默认折叠；主行由 filterToolbarPrimary 注入
   *（出团日期 + Segmented），样式对齐 antd advanced-search。
   */
  collapsibleSecondaryFilters?: boolean
  filterToolbarPrimary?: (controls: {
    onDepartureDateRangeChange: (value: DepartureDateRange) => void
  }) => React.ReactNode
}

export function PaymentScheduleWorkspace(props: PaymentScheduleWorkspaceProps) {
  const {
    isReceivable,
    isDepartureScope,
    effectiveDepartureId,
    statusFilter,
    keyword,
    dueDateRange,
    departureDateRange,
    counterpartyKeyword,
    page,
    pageSize,
    setPage,
    setPageSize,
    setDepartureFilter,
    setStatusFilter,
    setKeyword,
    setDueDateRange,
    setDepartureDateRange,
    setCounterpartyKeyword,
    resetFilters,
    scope,
    hardLoading,
    softFetching,
    isFetching,
    isError,
    error,
    hasListData,
    refetch,
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

  const secondaryFiltersActive = Boolean(
    keyword.trim() || statusFilter || dueDateRange?.[0] || dueDateRange?.[1],
  )

  const filters = (
    <PaymentScheduleFilters
      departureId={effectiveDepartureId}
      statusFilter={statusFilter}
      keyword={keyword}
      counterpartyKeyword={counterpartyKeyword}
      dueDateRange={dueDateRange}
      departureDateRange={departureDateRange}
      scope={scope}
      isReceivable={isReceivable}
      hideDepartureDateFilter={props.hideDepartureDateFilter}
      embedded={Boolean(props.collapsibleSecondaryFilters)}
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
      onCounterpartyKeywordChange={(value) => {
        setCounterpartyKeyword(value)
        setPage(1)
      }}
      onDueDateRangeChange={(value) => {
        setDueDateRange(value)
        setPage(1)
      }}
      onDepartureDateRangeChange={(value) => {
        setDepartureDateRange(value)
      }}
      onReset={resetFilters}
    />
  )

  return (
    <div>
      {props.pageHeader ? (
        <PageHeader
          title={props.pageHeader.title}
        />
      ) : null}

      {props.collapsibleSecondaryFilters ? (
        <div style={{ marginBottom: 16 }}>
          <CollapsibleFilterBar
            primary={props.filterToolbarPrimary?.({
              onDepartureDateRangeChange: setDepartureDateRange,
            })}
            advanced={filters}
            advancedActive={secondaryFiltersActive}
          />
        </div>
      ) : (
        filters
      )}

      {props.renderSummary
        ? props.renderSummary({
            departureDateFrom: departureDateRange?.[0],
            departureDateTo: departureDateRange?.[1],
          })
        : null}

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError && hasListData}
        hasData={hasListData}
        onRefresh={() => {
          void refetch()
        }}
      />

      {isError && !hasListData ? (
        <Alert
          type="error"
          showIcon
          title={`${isReceivable ? '应收单' : '应付单'}加载失败`}
          description={
            error instanceof Error ? error.message : '请稍后重试，或检查网络后再次加载。'
          }
          action={
            <Button size="small" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      ) : (
        <div className={listSoftFetchingClassName(softFetching)}>
          <PaymentScheduleTable
            loading={hardLoading}
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
        </div>
      )}

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
