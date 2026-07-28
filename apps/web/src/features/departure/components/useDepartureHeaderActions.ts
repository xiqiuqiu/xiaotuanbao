import { useCallback, useMemo, useState } from 'react'
import { Form, Modal, message } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DepartureDetail } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import {
  closeDeparture,
  purgeDeparture,
  transitionDeparture,
  unarchiveDeparture,
} from '@/services/departure.service'
import { departureToFormValues, type DepartureOverviewFormValues } from '../utils/departure-overview-form'
import type { DepartureTransitionAction } from '../utils/departure-transition'
import {
  resolveDepartureHeaderActions,
  type DepartureHeaderActionKey,
} from '../utils/departure-header-actions'
import { resolveDepartureListReturnSearch } from '../utils/departure-list-search'
import type { CloseDepartureFormValues } from './DepartureTransitionModal'
import type { UnarchiveDepartureFormValues } from './DepartureUnarchiveModal'

function insertMenuDividers(
  items: Array<{
    key: DepartureHeaderActionKey
    label: string
    danger?: boolean
    group: 'primary' | 'secondary' | 'status' | 'danger'
  }>,
  onAction: (key: DepartureHeaderActionKey) => void,
): NonNullable<MenuProps['items']> {
  const result: NonNullable<MenuProps['items']> = []
  let previousGroup: string | null = null

  for (const item of items) {
    if (previousGroup && previousGroup !== item.group) {
      result.push({ type: 'divider' })
    }
    result.push({
      key: item.key,
      label: item.label,
      danger: item.danger,
      onClick: () => onAction(item.key),
    })
    previousGroup = item.group
  }

  return result
}

export function useDepartureHeaderActions(
  departure: DepartureDetail,
  canWrite: boolean,
  onUpdated: () => void,
) {
  const navigate = useNavigate()
  const locationState = useRouterState({ select: (state) => state.location.state })
  const search = useSearch({ strict: false }) as { listReturn?: string }
  const queryClient = useQueryClient()
  const [overviewForm] = Form.useForm<DepartureOverviewFormValues>()
  const [closeForm] = Form.useForm<CloseDepartureFormValues>()
  const [unarchiveForm] = Form.useForm<UnarchiveDepartureFormValues>()
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [operationsSheetOpen, setOperationsSheetOpen] = useState(false)
  const [unarchiveModalOpen, setUnarchiveModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transitionAction, setTransitionAction] = useState<DepartureTransitionAction | null>(null)

  const resolved = useMemo(
    () =>
      resolveDepartureHeaderActions({
        status: departure.status,
        canWrite,
        isFinanciallySettled: departure.isFinanciallySettled,
        canPurge: departure.canPurge,
      }),
    [canWrite, departure.canPurge, departure.isFinanciallySettled, departure.status],
  )

  const invalidateDeparture = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
    void queryClient.invalidateQueries({ queryKey: ['departures'] })
    onUpdated()
  }, [departure.id, onUpdated, queryClient])

  const transitionMutation = useMutation({
    mutationFn: (targetStatus: DepartureStatus) =>
      transitionDeparture(departure.id, { targetStatus }),
    onSuccess: () => {
      message.success('状态已更新')
      setTransitionAction(null)
      invalidateDeparture()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '状态切换失败')
    },
  })

  const closeMutation = useMutation({
    mutationFn: (reason: string) => closeDeparture(departure.id, { reason }),
    onSuccess: () => {
      message.success('发团已关闭')
      setTransitionAction(null)
      closeForm.resetFields()
      invalidateDeparture()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '关闭失败')
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: (reason: string) => unarchiveDeparture(departure.id, { reason }),
    onSuccess: () => {
      message.success('已解除归档，发团回到待结算')
      setUnarchiveModalOpen(false)
      unarchiveForm.resetFields()
      invalidateDeparture()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '解除归档失败')
    },
  })

  const purgeMutation = useMutation({
    mutationFn: () => purgeDeparture(departure.id),
    onSuccess: () => {
      message.success('发团已删除')
      void queryClient.invalidateQueries({ queryKey: ['departures'] })
      const listSearch = resolveDepartureListReturnSearch(locationState, search.listReturn)
      void navigate({ to: '/departure', search: listSearch })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '删除发团失败')
    },
  })

  const confirmPurge = useCallback(() => {
    Modal.confirm({
      title: '确认删除该发团？',
      content: `将永久删除 ${departure.departureNo}「${departure.name}」，不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => purgeMutation.mutateAsync(),
    })
  }, [departure.departureNo, departure.name, purgeMutation])

  const openEditDrawer = useCallback(() => {
    overviewForm.setFieldsValue(departureToFormValues(departure))
    setEditDrawerOpen(true)
  }, [departure, overviewForm])

  const handleActionKey = useCallback(
    (key: DepartureHeaderActionKey) => {
      switch (key) {
        case 'edit':
          openEditDrawer()
          break
        case 'operations_sheet':
          setOperationsSheetOpen(true)
          break
        case 'save_template':
          setSaveModalOpen(true)
          break
        case 'pending_settlement':
          setTransitionAction('pending_settlement')
          break
        case 'settled':
          setTransitionAction('settled')
          break
        case 'close':
          setTransitionAction('close')
          break
        case 'unarchive':
          setUnarchiveModalOpen(true)
          break
        case 'purge':
          confirmPurge()
          break
      }
    },
    [confirmPurge, openEditDrawer],
  )

  const actionLoading =
    transitionMutation.isPending ||
    closeMutation.isPending ||
    unarchiveMutation.isPending ||
    purgeMutation.isPending

  const handleTransitionConfirm = () => {
    if (!transitionAction || transitionAction === 'close') {
      return
    }

    const targetStatus =
      transitionAction === 'pending_settlement'
        ? DepartureStatus.PENDING_SETTLEMENT
        : DepartureStatus.SETTLED

    transitionMutation.mutate(targetStatus)
  }

  const handleCloseSubmit = (values: CloseDepartureFormValues) => {
    closeMutation.mutate(values.reason.trim())
  }

  const handleUnarchiveSubmit = (values: UnarchiveDepartureFormValues) => {
    unarchiveMutation.mutate(values.reason.trim())
  }

  const menuItems = useMemo(
    () => insertMenuDividers(resolved.menuItems, handleActionKey),
    [handleActionKey, resolved.menuItems],
  )

  const primaryAction = resolved.primaryAction
    ? {
        label: resolved.primaryAction.label,
        onClick: () => handleActionKey('edit'),
      }
    : null

  return {
    overviewForm,
    closeForm,
    unarchiveForm,
    saveModalOpen,
    setSaveModalOpen,
    editDrawerOpen,
    setEditDrawerOpen,
    operationsSheetOpen,
    setOperationsSheetOpen,
    unarchiveModalOpen,
    setUnarchiveModalOpen,
    historyOpen,
    setHistoryOpen,
    transitionAction,
    setTransitionAction,
    actionLoading,
    unarchivePending: unarchiveMutation.isPending,
    menuItems,
    primaryAction,
    handleActionKey,
    handleTransitionConfirm,
    handleCloseSubmit,
    handleUnarchiveSubmit,
    openEditDrawer,
  }
}
