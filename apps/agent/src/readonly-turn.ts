import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'

const FIELD_LABELS: Record<string, string> = {
  name: '团名',
  routeName: '路线',
  startDate: '出团日期',
  endDate: '结束日期',
  ownerUserId: '负责人',
  departureType: '发团类型',
  expectedGuestCountHint: '预计人数提示',
  notes: '备注',
}

export function buildReadonlyAssistReply(context: GetTaskContextOutput): string {
  const filled = context.fieldCoverage.filled
    .map((field) => FIELD_LABELS[field] ?? field)
    .join('、')
  const missing = context.fieldCoverage.missing
    .map((field) => FIELD_LABELS[field] ?? field)
    .join('、')
  const optional = context.fieldCoverage.optionalPresent
    .map((field) => FIELD_LABELS[field] ?? field)
    .join('、')

  const lines = [
    `当前发团创建草稿版本 ${context.objectVersion}。`,
    filled ? `已填写：${filled}。` : '还没有已保存的必填基础信息。',
    missing ? `仍缺少：${missing}。请先补充其中一项。` : '必填基础信息已齐，可以直接在表单确认创建。',
  ]
  if (optional) {
    lines.push(`可选已填：${optional}。`)
  }
  lines.push('我只会读取当前业务快照，不会改写发团创建草稿。')
  return lines.join('')
}
