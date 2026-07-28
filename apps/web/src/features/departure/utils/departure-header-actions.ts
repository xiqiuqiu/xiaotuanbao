import { DepartureStatus } from '@xiaotuanbao/shared'

export type DepartureHeaderActionKey =
  | 'edit'
  | 'operations_sheet'
  | 'save_template'
  | 'pending_settlement'
  | 'settled'
  | 'close'
  | 'unarchive'
  | 'purge'

export type DepartureHeaderActionItem = {
  key: DepartureHeaderActionKey
  label: string
  danger?: boolean
  group: 'primary' | 'secondary' | 'status' | 'danger'
}

export function resolveDepartureHeaderActions(input: {
  status: string
  canWrite: boolean
  isFinanciallySettled: boolean
  canPurge: boolean
}): {
  /** Shown as the single primary button outside the menu when present */
  primaryAction: DepartureHeaderActionItem | null
  /** Menu items in display order, already grouped with conceptual sections */
  menuItems: DepartureHeaderActionItem[]
} {
  const { status, canWrite, isFinanciallySettled, canPurge } = input

  const overviewReadOnly =
    status === DepartureStatus.SETTLED || status === DepartureStatus.CLOSED

  const canEdit = canWrite && !overviewReadOnly
  const canTransitionToPending = canEdit && status === DepartureStatus.EDITING
  const canTransitionToSettled =
    canEdit &&
    status === DepartureStatus.PENDING_SETTLEMENT &&
    isFinanciallySettled
  const canClose = canWrite && status !== DepartureStatus.CLOSED
  const canUnarchive = canWrite && status === DepartureStatus.CLOSED
  const canPurgeAction = canWrite && canPurge

  const primaryAction: DepartureHeaderActionItem | null = canEdit
    ? { key: 'edit', label: '编辑发团', group: 'primary' }
    : null

  const secondaryItems: DepartureHeaderActionItem[] = [
    { key: 'operations_sheet', label: '发团运营表', group: 'secondary' },
  ]

  if (canWrite) {
    secondaryItems.push({
      key: 'save_template',
      label: '保存为常用路线',
      group: 'secondary',
    })
  }

  const statusItems: DepartureHeaderActionItem[] = []

  if (canTransitionToPending) {
    statusItems.push({
      key: 'pending_settlement',
      label: '切换为待结算',
      group: 'status',
    })
  }

  if (canTransitionToSettled) {
    statusItems.push({
      key: 'settled',
      label: '标记为已结清',
      group: 'status',
    })
  }

  if (canUnarchive) {
    statusItems.push({
      key: 'unarchive',
      label: '解除归档',
      group: 'status',
    })
  }

  const dangerItems: DepartureHeaderActionItem[] = []

  if (canClose) {
    dangerItems.push({
      key: 'close',
      label: '关闭发团',
      danger: true,
      group: 'danger',
    })
  }

  if (canPurgeAction) {
    dangerItems.push({
      key: 'purge',
      label: '删除',
      danger: true,
      group: 'danger',
    })
  }

  return {
    primaryAction,
    menuItems: [...secondaryItems, ...statusItems, ...dangerItems],
  }
}
