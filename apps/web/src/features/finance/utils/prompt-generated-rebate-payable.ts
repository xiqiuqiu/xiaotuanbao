import { Modal } from 'antd'
import type { PaymentScheduleSummary } from '@xiaotuanbao/shared'
import { formatCents } from '../catalog'

export function shouldPromptGeneratedRebatePayable(
  rebate: PaymentScheduleSummary | null | undefined,
): rebate is PaymentScheduleSummary {
  return Boolean(rebate && rebate.amountCents > 0)
}

export function buildGeneratedRebatePayablePromptCopy(rebate: PaymentScheduleSummary): {
  title: string
  content: string
} {
  return {
    title: '已提交返利应付',
    content: `游客代收已齐账，系统已提交返利应付单 ${rebate.scheduleNo}（${formatCents(rebate.amountCents)}）。请财务处理付款。`,
  }
}

/**
 * 核销齐账后若落账返利应付：提示财务处理；「去处理」跳转该发团应付 Tab 并筛该单号。
 */
export function promptGeneratedRebatePayableFollowUp(
  rebate: PaymentScheduleSummary | null | undefined,
  onGoProcess: (rebate: PaymentScheduleSummary) => void,
): void {
  if (!shouldPromptGeneratedRebatePayable(rebate)) {
    return
  }

  const copy = buildGeneratedRebatePayablePromptCopy(rebate)
  Modal.confirm({
    title: copy.title,
    content: copy.content,
    okText: '去处理',
    cancelText: '稍后处理',
    onOk: () => {
      onGoProcess(rebate)
    },
  })
}

/**
 * 「去处理」导航目标：留在该返利所属发团的应付 Tab，并按单号定位。
 * （勿跳公共 /finance/payable，会离开团单上下文。）
 */
export function buildGeneratedRebatePayableProcessNavigation(
  rebate: PaymentScheduleSummary,
): {
  to: '/departure/$departureId'
  params: { departureId: string }
  search: {
    tab: 'payables'
    scheduleNo: string
    highlightSourceOrderId?: string
  }
} {
  return {
    to: '/departure/$departureId',
    params: { departureId: rebate.departureId },
    search: {
      tab: 'payables',
      scheduleNo: rebate.scheduleNo,
      ...(rebate.sourceId ? { highlightSourceOrderId: rebate.sourceId } : {}),
    },
  }
}
