import { describe, expect, it } from 'vitest'
import type { DepartureMaterialView } from '@xiaotuanbao/shared'
import { openedMaterialIds, windowMaterialConsume } from './window-material-consume'

function material(
  overrides: Partial<DepartureMaterialView> & Pick<DepartureMaterialView, 'id' | 'status'>,
): DepartureMaterialView {
  return {
    originalFilename: `${overrides.id}.pdf`,
    contentType: 'application/pdf',
    statusVersion: 1,
    createdAt: '2026-08-14T00:00:00.000Z',
    latestResultVersion: 1,
    ...overrides,
  }
}

describe('windowMaterialConsume', () => {
  it('ignores archives that already existed when the assist window opened', () => {
    const existing = material({ id: 'old-1', status: 'available' })
    expect(
      windowMaterialConsume({
        materials: [existing],
        openedMaterialIds: openedMaterialIds([existing]),
      }),
    ).toEqual({ pending: false, key: null })
  })

  it('waits while a window archive is still parsing', () => {
    expect(
      windowMaterialConsume({
        materials: [material({ id: 'new-1', status: 'parsing', latestResultVersion: null })],
        openedMaterialIds: new Set(),
      }),
    ).toEqual({ pending: false, key: null })
  })

  it('is pending only for archives sent in this window', () => {
    const existing = material({ id: 'old-1', status: 'available' })
    const incoming = material({ id: 'new-1', status: 'available', latestResultVersion: 2 })
    expect(
      windowMaterialConsume({
        materials: [existing, incoming],
        openedMaterialIds: openedMaterialIds([existing]),
      }),
    ).toEqual({ pending: true, key: 'new-1:2' })
  })
})
