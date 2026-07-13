import { CounterpartyType } from '@xiaotuanbao/shared'
import type { PaymentScheduleCounterpartyOption } from '@xiaotuanbao/shared'

export type CounterpartyEntitySelection = {
  counterpartyId?: string
  counterpartyName?: string
}

export type CounterpartyCascaderOption = {
  value: string
  label: string
  children?: Array<{ value: string; label: string }>
}

export function encodeCounterpartyEntityKey(
  option: Pick<
    PaymentScheduleCounterpartyOption,
    'counterpartyId' | 'counterpartyName'
  >,
): string {
  const id = option.counterpartyId?.trim()
  if (id) {
    return `id:${id}`
  }
  return `name:${option.counterpartyName?.trim() ?? ''}`
}

export function decodeCounterpartyEntityKey(
  key: string | undefined,
): CounterpartyEntitySelection | undefined {
  if (!key) {
    return undefined
  }
  if (key.startsWith('id:')) {
    const counterpartyId = key.slice(3)
    return counterpartyId ? { counterpartyId } : undefined
  }
  if (key.startsWith('name:')) {
    const counterpartyName = key.slice(5)
    return counterpartyName ? { counterpartyName } : undefined
  }
  return undefined
}

export function counterpartyTypeOptionsForDirection(
  direction: 'receivable' | 'payable',
): Array<{ value: CounterpartyType; label: string }> {
  if (direction === 'receivable') {
    return [
      { value: CounterpartyType.PARTNER, label: '合作伙伴' },
      { value: CounterpartyType.GUEST, label: '游客代收' },
    ]
  }
  return [
    { value: CounterpartyType.SUPPLIER, label: '供应商' },
    { value: CounterpartyType.PARTNER, label: '合作伙伴' },
  ]
}

export function buildCounterpartyCascaderOptions(
  direction: 'receivable' | 'payable',
  counterparties: PaymentScheduleCounterpartyOption[],
): CounterpartyCascaderOption[] {
  const childrenByType = new Map<string, Array<{ value: string; label: string }>>()

  for (const item of counterparties) {
    const children = childrenByType.get(item.counterpartyType) ?? []
    children.push({
      value: encodeCounterpartyEntityKey(item),
      label: item.counterpartyName?.trim() || item.counterpartyId || '未命名往来对象',
    })
    childrenByType.set(item.counterpartyType, children)
  }

  return counterpartyTypeOptionsForDirection(direction).map((typeOption) => {
    const children = childrenByType.get(typeOption.value) ?? []
    return {
      value: typeOption.value,
      label: typeOption.label,
      ...(children.length > 0 ? { children } : {}),
    }
  })
}

export function toCounterpartyCascaderValue(
  counterpartyType?: CounterpartyType,
  counterpartyEntityKey?: string,
): string[] | undefined {
  if (!counterpartyType) {
    return undefined
  }
  if (counterpartyEntityKey) {
    return [counterpartyType, counterpartyEntityKey]
  }
  return [counterpartyType]
}
