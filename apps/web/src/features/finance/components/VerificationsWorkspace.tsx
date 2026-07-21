import { useCallback, useMemo, useReducer, useState } from 'react'
import { Form } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import type { FinanceVerificationListItem } from '@xiaotuanbao/shared'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import { CreateVerificationDrawer } from './CreateVerificationDrawer'
import {
  CancelVerificationModal,
  type CancelVerificationFormValues,
} from './CancelVerificationModal'
import { VerificationDetailDrawer } from './VerificationDetailDrawer'
import { type CreateVerificationFormValues } from '../utils/verification-form'
import {
  deepLinkKey,
  type VerificationDeepLinkSearch,
} from '../utils/verification-list-deep-link'
import {
  createInitialVerificationListState,
  createVerificationListReducer,
} from '../utils/verification-list-state'
import { useVerificationWorkspaceMutations } from '../hooks/useVerificationWorkspaceMutations'
import { useVerificationDeepLinkSync } from '../hooks/useVerificationDeepLinkSync'
import { useVerificationsWorkspaceQuery } from '../hooks/useVerificationsWorkspaceQuery'
import { buildVerificationColumns } from './verification-table-columns'
import {
  CreateVerificationButton,
  VerificationListContent,
  VerificationWorkspaceFilters,
} from './verification-workspace-sections'

export type VerificationsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
  deepLinkSearch?: VerificationDeepLinkSearch
  /** When set, renders the standard list page header (title + secondary). */
  pageHeader?: {
    title: string
  }
}

export function VerificationsWorkspace({
  scope,
  departureId: lockedDepartureId,
  readOnly = false,
  deepLinkSearch,
  pageHeader,
}: VerificationsWorkspaceProps) {
  const navigate = useNavigate()
  const [form] = Form.useForm<CreateVerificationFormValues>()
  const [cancelForm] = Form.useForm<CancelVerificationFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [detailVerificationId, setDetailVerificationId] = useState<string | null>(null)
  const reducer = useMemo(() => createVerificationListReducer(scope), [scope])
  const [listState, dispatchList] = useReducer(reducer, deepLinkSearch, (search) =>
    createInitialVerificationListState(search, scope),
  )
  const { page, pageSize, lock } = listState
  const currentDeepLinkKey = deepLinkKey(deepLinkSearch)

  useVerificationDeepLinkSync({
    currentDeepLinkKey,
    deepLinkSearch,
    lock,
    dispatchList,
  })

  const syncDeepLinkSearch = useCallback(
    (nextSearch: VerificationDeepLinkSearch) => {
      if (scope === 'departure') {
        if (!lockedDepartureId) {
          return
        }
        void navigate({
          to: '/departure/$departureId',
          params: { departureId: lockedDepartureId },
          search: {
            tab: 'verifications',
            ...nextSearch,
          },
          replace: true,
        })
        return
      }
      void navigate({
        to: '/finance/verification',
        search: nextSearch,
        replace: true,
      })
    },
    [lockedDepartureId, navigate, scope],
  )

  const {
    isDepartureScope,
    verificationsResult,
    isFetching,
    isError,
    error,
    refetch,
    hardLoading,
    softFetching,
  } = useVerificationsWorkspaceQuery({
    scope,
    lockedDepartureId,
    listState,
  })

  const handleOpenDetail = useCallback((verificationId: string) => {
    setDetailVerificationId(() => verificationId)
    setDetailDrawerOpen(true)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailDrawerOpen(false)
    setDetailVerificationId(null)
  }, [])

  const handleResetFilters = useCallback(() => {
    dispatchList({ type: 'resetFilters' })
    syncDeepLinkSearch({})
  }, [syncDeepLinkSearch])

  const handleTransactionNoChange = useCallback(
    (value: string) => {
      dispatchList({ type: 'setTransactionNo', value })
      if (lock) {
        syncDeepLinkSearch({})
      }
    },
    [lock, syncDeepLinkSearch],
  )

  const handleScheduleNoChange = useCallback(
    (value: string) => {
      dispatchList({ type: 'setScheduleNo', value })
      if (lock) {
        syncDeepLinkSearch({})
      }
    },
    [lock, syncDeepLinkSearch],
  )

  const {
    createMutation,
    cancelMutation,
    cancellingVerification,
    openCancelModal,
    closeCancelModal,
  } = useVerificationWorkspaceMutations({
    form,
    cancelForm,
    onCreateSuccess: () => setModalOpen(false),
    onCancelSuccess: () => setCancelModalOpen(false),
  })

  const handleOpenCancelModal = useCallback(
    (verification: FinanceVerificationListItem) => {
      openCancelModal({ ...verification })
      setCancelModalOpen(true)
    },
    [openCancelModal],
  )

  const handleCloseCancelModal = useCallback(() => {
    setCancelModalOpen(false)
    closeCancelModal()
  }, [closeCancelModal])

  const columns = useMemo(
    () =>
      buildVerificationColumns({
        isDepartureScope,
        readOnly,
        onOpenDetail: handleOpenDetail,
        onOpenCancelModal: handleOpenCancelModal,
      }),
    [handleOpenCancelModal, handleOpenDetail, isDepartureScope, readOnly],
  )

  const createButton = !readOnly ? (
    <CreateVerificationButton onClick={() => setModalOpen(true)} />
  ) : null

  return (
    <div>
      <VerificationWorkspaceFilters
        scope={scope}
        pageHeader={pageHeader}
        createButton={createButton}
        listState={listState}
        dispatchList={dispatchList}
        onTransactionNoChange={handleTransactionNoChange}
        onScheduleNoChange={handleScheduleNoChange}
        onReset={handleResetFilters}
      />

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError && Boolean(verificationsResult)}
        hasData={Boolean(verificationsResult)}
        onRefresh={() => {
          void refetch()
        }}
      />

      <VerificationListContent
        isError={isError}
        error={error}
        hasData={Boolean(verificationsResult)}
        onRetry={() => void refetch()}
        loading={hardLoading}
        softFetching={softFetching}
        columns={columns}
        items={verificationsResult?.items ?? []}
        page={page}
        pageSize={pageSize}
        total={verificationsResult?.total ?? 0}
        onPageChange={(nextPage, nextPageSize) => {
          dispatchList({ type: 'setPage', value: nextPage })
          dispatchList({ type: 'setPageSize', value: nextPageSize })
        }}
      />

      <VerificationDetailDrawer
        open={detailDrawerOpen}
        verificationId={detailVerificationId}
        onClose={handleCloseDetail}
      />

      {!readOnly && modalOpen ? (
        <CreateVerificationDrawer
          key="create-verification"
          open={modalOpen}
          loading={createMutation.isPending}
          form={form}
          lockedDepartureId={isDepartureScope ? lockedDepartureId : undefined}
          onClose={() => {
            setModalOpen(false)
            form.resetFields()
          }}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      ) : null}

      {!readOnly ? (
        <CancelVerificationModal
          open={cancelModalOpen}
          verification={cancellingVerification}
          loading={cancelMutation.isPending}
          form={cancelForm}
          onClose={handleCloseCancelModal}
          onSubmit={(values) => {
            if (!cancellingVerification) {
              return
            }
            cancelMutation.mutate({
              id: cancellingVerification.id,
              cancelReason: values.cancelReason,
            })
          }}
        />
      ) : null}
    </div>
  )
}
