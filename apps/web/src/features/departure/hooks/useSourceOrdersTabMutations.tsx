import { Modal, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, type MutableRefObject } from 'react'
import {
  countSourceOrderReceivablePaths,
  didSourceAmountPathChange,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { formatCents } from '../catalog'
import {
  createSourceOrder,
  createSourceOrderGuest,
  deleteSourceOrder,
  deleteSourceOrderGuest,
  generateReceivables,
  generateReceivablesForDeparture,
  getGuestCollectionChangeImpact,
  updateSourceOrder,
  updateSourceOrderGuest,
} from '@/services/source-order.service'
import {
  formatBatchFinanceGenerationConfirmContent,
  formatBatchFinanceGenerationMessage,
} from '../utils/batch-finance-generation-message'
import {
  formValuesToPayload,
  resolvePathAmountsFromPayload,
  type SourceOrderPathBaseline,
} from '../utils/source-order-form'
import {
  planSourceOrderGuestSync,
  type SourceOrderGuestSyncBundle,
} from '../utils/source-order-guest-form'
import type { DrawerState } from '../components/source-orders-tab-state'

interface UseSourceOrdersTabMutationsParams {
  departure: DepartureDetail
  drawer: DrawerState
  onCloseDrawer: () => void
}

type SourceOrderSaveInput = {
  payload: ReturnType<typeof formValuesToPayload>
  guests?: SourceOrderGuestSyncBundle
}

async function persistGuestSync(
  sourceOrderId: string,
  guests: SourceOrderGuestSyncBundle,
) {
  const ops = planSourceOrderGuestSync(guests.baseline, guests.next)
  const deletes = ops.filter((op) => op.type === 'delete')
  const updates = ops.filter((op) => op.type === 'update')
  const creates = ops.filter((op) => op.type === 'create')

  await Promise.all(
    deletes.map((op) => deleteSourceOrderGuest(sourceOrderId, op.guestId)),
  )
  await Promise.all(
    updates.map((op) => updateSourceOrderGuest(sourceOrderId, op.guestId, op.payload)),
  )
  await Promise.all(
    creates.map((op) => createSourceOrderGuest(sourceOrderId, op.payload)),
  )
}

export function useSourceOrdersTabMutations({
  departure,
  drawer,
  onCloseDrawer,
}: UseSourceOrdersTabMutationsParams) {
  const queryClient = useQueryClient()

  const invalidateSourceOrders = () => {
    void queryClient.invalidateQueries({ queryKey: ['source-orders', departure.id] })
    void queryClient.invalidateQueries({ queryKey: ['source-order'] })
    void queryClient.invalidateQueries({ queryKey: ['source-order-guests'] })
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const invalidateFinance = () => {
    void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
  }

  const saveMutation = useMutation({
    mutationFn: async ({ payload, guests }: SourceOrderSaveInput) => {
      const editingId = drawer.editingOrder?.id ?? null
      const saved = editingId
        ? await updateSourceOrder(editingId, payload)
        : await createSourceOrder(departure.id, payload)
      if (guests) {
        await persistGuestSync(saved.id, guests)
      }
      return { saved, editingId }
    },
    onSuccess: ({ editingId }) => {
      message.success(editingId ? '客源单已更新' : '客源单已添加')
      invalidateSourceOrders()
      if ((drawer.editingOrder?.id ?? null) !== editingId) {
        return
      }
      onCloseDrawer()
    },
  })

  const saveAndGenerateMutation = useMutation({
    mutationFn: async ({ payload, guests }: SourceOrderSaveInput) => {
      const editingId = drawer.editingOrder?.id ?? null
      const saved = editingId
        ? await updateSourceOrder(editingId, payload)
        : await createSourceOrder(departure.id, payload)
      if (guests) {
        await persistGuestSync(saved.id, guests)
      }
      try {
        const generateResult = await generateReceivables(saved.id)
        return { saved, editingId, generateOk: true as const, generateResult }
      } catch (error) {
        return { saved, editingId, generateOk: false as const, generateError: error }
      }
    },
    onSuccess: (result) => {
      invalidateSourceOrders()
      if ((drawer.editingOrder?.id ?? null) !== result.editingId) {
        return
      }
      if (!result.generateOk) {
        message.warning(
          `客源单已保存，但提交应收失败：${
            result.generateError instanceof Error
              ? result.generateError.message
              : '请稍后在列表中重试'
          }`,
        )
        onCloseDrawer()
        return
      }
      message.success(
        result.generateResult.sourceAmountMismatch
          ? '已保存并提交应收，存在来源金额差异，请核对'
          : '已保存并提交应收',
      )
      invalidateFinance()
      onCloseDrawer()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存客源单失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSourceOrder(id),
    onSuccess: () => {
      message.success('客源单已删除')
      invalidateSourceOrders()
    },
  })

  const generateMutation = useMutation({
    mutationFn: (id: string) => generateReceivables(id),
    onSuccess: (result) => {
      message.success(
        result.sourceAmountMismatch
          ? '应收已提交，存在来源金额差异，请核对'
          : '应收已提交',
      )
      invalidateSourceOrders()
      invalidateFinance()
    },
  })

  const batchGenerateMutation = useMutation({
    mutationFn: () => generateReceivablesForDeparture(departure.id),
    onSuccess: (result) => {
      const text = formatBatchFinanceGenerationMessage(result, '应收')
      if (result.failed > 0) {
        message.warning(text)
      } else if (result.succeeded > 0) {
        message.success(text)
      } else {
        message.info(text)
      }
      invalidateSourceOrders()
      invalidateFinance()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '批量提交应收失败')
    },
  })

  return {
    saveMutation,
    saveAndGenerateMutation,
    deleteMutation,
    generateMutation,
    batchGenerateMutation,
  }
}

interface UseSourceOrderSubmitParams {
  editingOrder: SourceOrderSummary | null
  saveMutation: ReturnType<typeof useSourceOrdersTabMutations>['saveMutation']
  saveAndGenerateMutation: ReturnType<
    typeof useSourceOrdersTabMutations
  >['saveAndGenerateMutation']
  impactAbortRef: MutableRefObject<AbortController | null>
  latestEditingOrderIdRef: MutableRefObject<string | undefined>
}

export function useSourceOrderSubmit({
  editingOrder,
  saveMutation,
  saveAndGenerateMutation,
  impactAbortRef,
  latestEditingOrderIdRef,
}: UseSourceOrderSubmitParams) {
  return useCallback(
    async (
      payload: ReturnType<typeof formValuesToPayload>,
      /**
       * Authoritative path amounts for change detection. Must come from the drawer GET
       * detail used to hydrate the form; the list row can lag after receivable sync.
       */
      pathBaseline: SourceOrderPathBaseline | null = null,
      options: {
        generateReceivable?: boolean
        guests?: SourceOrderGuestSyncBundle
      } = {},
    ) => {
      const saveInput: SourceOrderSaveInput = {
        payload,
        guests: options.guests,
      }
      const runSave = () =>
        options.generateReceivable
          ? saveAndGenerateMutation.mutate(saveInput)
          : saveMutation.mutate(saveInput)
      const runSaveAsync = () =>
        options.generateReceivable
          ? saveAndGenerateMutation.mutateAsync(saveInput)
          : saveMutation.mutateAsync(saveInput)

      if (!editingOrder || !pathBaseline) {
        runSave()
        return
      }

      const nextPath = resolvePathAmountsFromPayload(payload)
      const pathChanged = didSourceAmountPathChange(pathBaseline, nextPath)
      if (!pathChanged) {
        runSave()
        return
      }

      impactAbortRef.current?.abort()
      const controller = new AbortController()
      impactAbortRef.current = controller
      const requestOrderId = editingOrder.id

      let impact
      try {
        impact = await getGuestCollectionChangeImpact(requestOrderId, controller.signal)
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        throw error
      }

      if (latestEditingOrderIdRef.current !== requestOrderId) {
        return
      }

      if (impact.affectedTransactionCount <= 0) {
        runSave()
        return
      }

      Modal.confirm({
        title: '关联流水金额可能受影响',
        content: (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <span>
              我方代收 {formatCents(pathBaseline.guestCollectCents)} →{' '}
              {formatCents(nextPath.guestCollectCents)}
              {pathBaseline.partnerCollectedCents !== nextPath.partnerCollectedCents
                ? `；客户已收 ${formatCents(pathBaseline.partnerCollectedCents)} → ${formatCents(nextPath.partnerCollectedCents)}`
                : ''}
              {pathBaseline.depositCents !== nextPath.depositCents ||
              pathBaseline.balanceCents !== nextPath.balanceCents
                ? `；定金 ${formatCents(pathBaseline.depositCents)} → ${formatCents(nextPath.depositCents)}；尾款 ${formatCents(pathBaseline.balanceCents)} → ${formatCents(nextPath.balanceCents)}`
                : ''}
            </span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              本单有 {impact.affectedTransactionCount}{' '}
              笔未核销游客代收流水创建于变更前，保存后将标记「客源金额已变更」。确认继续？
            </Typography.Text>
          </Space>
        ),
        okText: options.generateReceivable ? '仍要保存并提交' : '仍要保存',
        cancelText: '取消',
        onOk: () => {
          if (latestEditingOrderIdRef.current !== requestOrderId) {
            return
          }
          return runSaveAsync()
        },
      })
    },
    [
      editingOrder,
      impactAbortRef,
      latestEditingOrderIdRef,
      saveAndGenerateMutation,
      saveMutation,
    ],
  )
}

export function confirmBatchGenerateReceivables(
  pendingReceivableCount: number,
  batchGenerateMutation: ReturnType<typeof useSourceOrdersTabMutations>['batchGenerateMutation'],
) {
  if (pendingReceivableCount <= 0) {
    return
  }
  Modal.confirm({
    title: '批量提交应收',
    content: (
      <Space orientation="vertical" size={4} style={{ width: '100%' }}>
        <span>{formatBatchFinanceGenerationConfirmContent(pendingReceivableCount, '应收')}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          「全部我方代收」按定金/尾款分别生成游客应收；「客户收定金+我方收尾款」仅生成尾款代收；当代收不足以覆盖结算金额时同批生成客户补款。
        </Typography.Text>
      </Space>
    ),
    okText: '提交',
    cancelText: '取消',
    onOk: () => batchGenerateMutation.mutateAsync(),
  })
}

export function countPendingReceivables(
  orders: SourceOrderSummary[] | undefined,
): number {
  return (orders ?? []).reduce((count, order) => {
    const needsGeneration =
      order.receivableStatus === SourceOrderReceivableStatus.NOT_GENERATED ||
      order.hasIncompleteReceivablePaths
    if (!needsGeneration) {
      return count
    }
    return (
      count +
      countSourceOrderReceivablePaths({
        collectionMode: order.collectionMode,
        depositCents: order.depositCents,
        balanceCents: order.balanceCents,
        netReceivableCents: order.netReceivableCents,
      })
    )
  }, 0)
}
