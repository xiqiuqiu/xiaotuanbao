import { Modal, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, type MutableRefObject } from 'react'
import {
  didSourceAmountPathChange,
  SourceOrderReceivableStatus,
} from '@xiaotuanbao/shared'
import type { DepartureDetail, SourceOrderSummary } from '@/types/api'
import { formatCents } from '../catalog'
import {
  createSourceOrder,
  deleteSourceOrder,
  generateReceivables,
  generateReceivablesForDeparture,
  getGuestCollectionChangeImpact,
  settleByActualCollection,
  updateSourceOrder,
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
import type { DrawerState } from '../components/source-orders-tab-state'

interface UseSourceOrdersTabMutationsParams {
  departure: DepartureDetail
  drawer: DrawerState
  onCloseDrawer: () => void
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
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
  }

  const invalidateFinance = () => {
    void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
    void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
    void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof formValuesToPayload>) => {
      const editingId = drawer.editingOrder?.id ?? null
      const saved = editingId
        ? await updateSourceOrder(editingId, payload)
        : await createSourceOrder(departure.id, payload)
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
    mutationFn: async (payload: ReturnType<typeof formValuesToPayload>) => {
      const editingId = drawer.editingOrder?.id ?? null
      const saved = editingId
        ? await updateSourceOrder(editingId, payload)
        : await createSourceOrder(departure.id, payload)
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
          `客源单已保存，但生成应收失败：${
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
          ? '已保存并生成应收，存在来源金额差异，请核对'
          : '已保存并生成应收',
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
          ? '应收已生成，存在来源金额差异，请核对'
          : '应收已生成',
      )
      invalidateSourceOrders()
      invalidateFinance()
    },
  })

  const settleMutation = useMutation({
    mutationFn: (input: { id: string; earlySettle?: boolean }) =>
      settleByActualCollection(input.id, { earlySettle: input.earlySettle }),
    onSuccess: (result) => {
      const parts = [
        `G实收 ${formatCents(result.actualGuestCollectedCents)}`,
        result.customerTopUpCents > 0
          ? `客户补款 ${formatCents(result.customerTopUpCents)}`
          : null,
        result.rebateCents > 0 ? `返利 ${formatCents(result.rebateCents)}` : null,
      ].filter(Boolean)
      message.success(`按实收结算完成：${parts.join(' · ')}`)
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
      message.error(error instanceof Error ? error.message : '批量生成应收失败')
    },
  })

  return {
    saveMutation,
    saveAndGenerateMutation,
    deleteMutation,
    generateMutation,
    settleMutation,
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
      options: { generateReceivable?: boolean } = {},
    ) => {
      const runSave = () =>
        options.generateReceivable
          ? saveAndGenerateMutation.mutate(payload)
          : saveMutation.mutate(payload)
      const runSaveAsync = () =>
        options.generateReceivable
          ? saveAndGenerateMutation.mutateAsync(payload)
          : saveMutation.mutateAsync(payload)

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
            </span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              本单有 {impact.affectedTransactionCount}{' '}
              笔未核销游客代收流水创建于变更前，保存后将标记「客源金额已变更」。确认继续？
            </Typography.Text>
          </Space>
        ),
        okText: options.generateReceivable ? '仍要保存并生成' : '仍要保存',
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
    title: '批量生成应收',
    content: (
      <Space orientation="vertical" size={4} style={{ width: '100%' }}>
        <span>{formatBatchFinanceGenerationConfirmContent(pendingReceivableCount, '应收')}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          收款方式为「合作方收定金+我方收尾款」的客源单会拆分为两条应收记录。
        </Typography.Text>
      </Space>
    ),
    okText: '生成',
    cancelText: '取消',
    onOk: () => batchGenerateMutation.mutateAsync(),
  })
}

export function confirmSettleByActualCollection(
  order: SourceOrderSummary,
  settleMutation: ReturnType<typeof useSourceOrdersTabMutations>['settleMutation'],
) {
  const run = async (earlySettle: boolean) => {
    try {
      await settleMutation.mutateAsync({ id: order.id, earlySettle })
    } catch (error) {
      const messageText = error instanceof Error ? error.message : ''
      if (!earlySettle && messageText.includes('尚未结清')) {
        Modal.confirm({
          title: '提前按实收结算？',
          content:
            '相关游客代收节点尚未结清。确认按当前已核销合计提前办理客户补款与返利？',
          okText: '提前结算',
          cancelText: '取消',
          onOk: () =>
            settleMutation.mutateAsync({ id: order.id, earlySettle: true }).catch((earlyError) => {
              message.error(
                earlyError instanceof Error ? earlyError.message : '按实收结算失败',
              )
            }),
        })
        return
      }
      message.error(messageText || '按实收结算失败')
    }
  }

  Modal.confirm({
    title: '按实收结算',
    content: (
      <Space orientation="vertical" size={4} style={{ width: '100%' }}>
        <span>
          将按定金/尾款节点已核销合计（G实收）生成或更新客户补款应收与返利应付。
        </span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          默认要求相关游客代收节点已结清；未结清时可在提示后选择提前结算。已有核销的补款/返利不会静默重算。
        </Typography.Text>
      </Space>
    ),
    okText: '结算',
    cancelText: '取消',
    onOk: () => run(false),
  })
}

export function countPendingReceivables(
  orders: SourceOrderSummary[] | undefined,
): number {
  return (orders ?? []).reduce((count, order) => {
    if (order.receivableStatus !== SourceOrderReceivableStatus.NOT_GENERATED) {
      return count
    }
    return (
      count +
      Number(order.partnerCollectedCents > 0) +
      Number(order.guestCollectCents > 0)
    )
  }, 0)
}
