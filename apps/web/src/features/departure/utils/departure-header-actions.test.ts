import { describe, expect, it } from 'vitest'
import { DepartureStatus } from '@xiaotuanbao/shared'
import {
  resolveDepartureHeaderActions,
  type DepartureHeaderActionItem,
} from './departure-header-actions'

function menuKeys(result: ReturnType<typeof resolveDepartureHeaderActions>): string[] {
  return result.menuItems.map((item) => item.key)
}

function findMenuItem(
  items: DepartureHeaderActionItem[],
  key: DepartureHeaderActionItem['key'],
): DepartureHeaderActionItem | undefined {
  return items.find((item) => item.key === key)
}

describe('resolveDepartureHeaderActions', () => {
  it('editing + canWrite → primary edit, secondary/status/danger menu; purge only when allowed', () => {
    const withoutPurge = resolveDepartureHeaderActions({
      status: DepartureStatus.EDITING,
      canWrite: true,
      isFinanciallySettled: false,
      canPurge: false,
    })

    expect(withoutPurge.primaryAction).toEqual({
      key: 'edit',
      label: '编辑发团',
      group: 'primary',
    })
    expect(menuKeys(withoutPurge)).toEqual([
      'operations_sheet',
      'save_template',
      'pending_settlement',
      'close',
    ])
    expect(findMenuItem(withoutPurge.menuItems, 'edit')).toBeUndefined()
    expect(findMenuItem(withoutPurge.menuItems, 'purge')).toBeUndefined()

    const withPurge = resolveDepartureHeaderActions({
      status: DepartureStatus.EDITING,
      canWrite: true,
      isFinanciallySettled: false,
      canPurge: true,
    })

    expect(menuKeys(withPurge)).toEqual([
      'operations_sheet',
      'save_template',
      'pending_settlement',
      'close',
      'purge',
    ])
    expect(findMenuItem(withPurge.menuItems, 'purge')).toMatchObject({
      label: '删除',
      danger: true,
      group: 'danger',
    })
  })

  it('pending_settlement + financially settled → mark settled available', () => {
    const result = resolveDepartureHeaderActions({
      status: DepartureStatus.PENDING_SETTLEMENT,
      canWrite: true,
      isFinanciallySettled: true,
      canPurge: false,
    })

    expect(result.primaryAction).toEqual({
      key: 'edit',
      label: '编辑发团',
      group: 'primary',
    })
    expect(findMenuItem(result.menuItems, 'settled')).toEqual({
      key: 'settled',
      label: '标记为已结清',
      group: 'status',
    })
    expect(findMenuItem(result.menuItems, 'pending_settlement')).toBeUndefined()
  })

  it('settled → no primary edit; close available if canWrite', () => {
    const result = resolveDepartureHeaderActions({
      status: DepartureStatus.SETTLED,
      canWrite: true,
      isFinanciallySettled: true,
      canPurge: false,
    })

    expect(result.primaryAction).toBeNull()
    expect(findMenuItem(result.menuItems, 'close')).toMatchObject({
      label: '关闭发团',
      danger: true,
      group: 'danger',
    })
    expect(findMenuItem(result.menuItems, 'edit')).toBeUndefined()
  })

  it('closed → unarchive if canWrite; no close', () => {
    const result = resolveDepartureHeaderActions({
      status: DepartureStatus.CLOSED,
      canWrite: true,
      isFinanciallySettled: false,
      canPurge: false,
    })

    expect(result.primaryAction).toBeNull()
    expect(findMenuItem(result.menuItems, 'unarchive')).toEqual({
      key: 'unarchive',
      label: '解除归档',
      group: 'status',
    })
    expect(findMenuItem(result.menuItems, 'close')).toBeUndefined()
  })

  it('!canWrite → no primary; view-only secondary only', () => {
    const result = resolveDepartureHeaderActions({
      status: DepartureStatus.EDITING,
      canWrite: false,
      isFinanciallySettled: false,
      canPurge: true,
    })

    expect(result.primaryAction).toBeNull()
    expect(result.menuItems).toEqual([
      {
        key: 'operations_sheet',
        label: '发团运营表',
        group: 'secondary',
      },
    ])
  })

  it('canPurge true only adds delete in danger group', () => {
    const result = resolveDepartureHeaderActions({
      status: DepartureStatus.SETTLED,
      canWrite: true,
      isFinanciallySettled: true,
      canPurge: true,
    })

    const purge = findMenuItem(result.menuItems, 'purge')
    expect(purge).toMatchObject({
      label: '删除',
      danger: true,
      group: 'danger',
    })
    expect(menuKeys(result).at(-1)).toBe('purge')
  })
})
