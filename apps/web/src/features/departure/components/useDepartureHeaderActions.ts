import { useCallback, useMemo, useState } from 'react'
import { Form, Modal, message } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate } from '@tanstack/react-router'
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
import type { CloseDepartureFormValues } from './DepartureTransitionModal'
import type { UnarchiveDepartureFormValues } from './DepartureUnarchiveModal'

export function useDepartureHeaderActions(
  departure: DepartureDetail,
  canWrite: boolean,
  onUpdated: () => void,
) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [overviewForm] = Form.useForm<DepartureOverviewFormValues>()
  const [closeForm] = Form.useForm<CloseDepartureFormValues>()
  const [unarchiveForm] = Form.useForm<UnarchiveDepartureFormValues>()
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [operationsSheetOpen, setOperationsSheetOpen] = useState(false)
  const [unarchiveModalOpen, setUnarchiveModalOpen] = useState(false)
  const [transitionAction, setTransitionAction] = useState<DepartureTransitionAction | null>(null)

  const overviewReadOnly =
    departure.status === DepartureStatus.SETTLED ||
    departure.status === DepartureStatus.CLOSED

  const canEdit = canWrite && !overviewReadOnly
  const canTransitionToPending = canEdit && departure.status === DepartureStatus.EDITING
  const canTransitionToSettled =
    canEdit &&
    departure.status === DepartureStatus.PENDING_SETTLEMENT &&
    departure.isFinanciallySettled
  const canClose = canWrite && departure.status !== DepartureStatus.CLOSED
  const canUnarchive = canWrite && departure.status === DepartureStatus.CLOSED
  const canPurge = canWrite && departure.canPurge

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
      void navigate({ to: '/departure' })
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

  const actionLoading =
    transitionMutation.isPending ||
    closeMutation.isPending ||
    unarchiveMutation.isPending ||
    purgeMutation.isPending

  const openEditDrawer = useCallback(() => {
    overviewForm.setFieldsValue(departureToFormValues(departure))
    setEditDrawerOpen(true)
  }, [departure, overviewForm])

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

  const menuItems = useMemo(() => {
    const items: NonNullable<MenuProps['items']> = []

    if (canEdit) {
      items.push({
        key: 'edit',
        label: '编辑',
        onClick: openEditDrawer,
      })
    }

    items.push({
      key: 'operations-sheet',
      label: '发团运营表',
      onClick: () => setOperationsSheetOpen(true),
    })

    if (canWrite) {
      items.push({
        key: 'save-template',
        label: '保存为常用路线',
        onClick: () => setSaveModalOpen(true),
      })
    }

    const statusItems: NonNullable<MenuProps['items']> = []

    if (canTransitionToPending) {
      statusItems.push({
        key: 'pending-settlement',
        label: '切换为待结算',
        onClick: () => setTransitionAction('pending_settlement'),
      })
    }

    if (canTransitionToSettled) {
      statusItems.push({
        key: 'settled',
        label: '标记为已结清',
        onClick: () => setTransitionAction('settled'),
      })
    }

    if (canClose) {
      statusItems.push({
        key: 'close',
        label: '关闭发团',
        danger: true,
        onClick: () => setTransitionAction('close'),
      })
    }

    if (canUnarchive) {
      statusItems.push({
        key: 'unarchive',
        label: '解除归档',
        onClick: () => setUnarchiveModalOpen(true),
      })
    }

    if (canPurge) {
      statusItems.push({
        key: 'purge',
        label: '删除',
        danger: true,
        onClick: confirmPurge,
      })
    }

    if (statusItems.length > 0) {
      items.push({ type: 'divider' }, ...statusItems)
    }

    return items
  }, [
    canClose,
    canEdit,
    canPurge,
    canTransitionToPending,
    canTransitionToSettled,
    canUnarchive,
    canWrite,
    confirmPurge,
    openEditDrawer,
  ])

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
    transitionAction,
    setTransitionAction,
    canTransitionToSettled,
    canUnarchive,
    actionLoading,
    unarchivePending: unarchiveMutation.isPending,
    menuItems,
    handleTransitionConfirm,
    handleCloseSubmit,
    handleUnarchiveSubmit,
  }
}
