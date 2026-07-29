import {
  FareAdjustmentKind,
  FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION,
} from './fare-adjustment-kind.enum'
import { FARE_ADJUSTMENT_KIND_CATALOG } from './fare-adjustment-kind.catalog'

/** ADR-0035 six-kind catalog: labels and locked directions are the product contract. */
const REQUIRED_CATALOG = [
  { label: '儿童门票补款', direction: 'increase' as const },
  { label: '单房差补款', direction: 'increase' as const },
  { label: '续住费用', direction: 'increase' as const },
  { label: '门票优惠退差', direction: 'decrease' as const },
  { label: '住宿费用扣减', direction: 'decrease' as const },
  { label: '其他费用调整', direction: null },
] as const

describe('FARE_ADJUSTMENT_KIND_CATALOG (ADR-0035)', () => {
  it('covers exactly the six product kinds with labels and directions', () => {
    expect(FARE_ADJUSTMENT_KIND_CATALOG).toHaveLength(6)
    const byLabel = Object.fromEntries(
      FARE_ADJUSTMENT_KIND_CATALOG.map((item) => [item.label, item]),
    )
    for (const required of REQUIRED_CATALOG) {
      expect(byLabel[required.label]?.direction).toBe(required.direction)
    }
  })

  it('does not expose custom as a kind', () => {
    expect(Object.values(FareAdjustmentKind)).not.toContain('custom')
    expect(FARE_ADJUSTMENT_KIND_CATALOG.map((item) => item.kind as string)).not.toContain(
      'custom',
    )
  })

  it('marks other as note-required multi-row escape hatch; fixed kinds are single-row', () => {
    const other = FARE_ADJUSTMENT_KIND_CATALOG.find(
      (item) => item.kind === FareAdjustmentKind.OTHER,
    )
    expect(other).toMatchObject({
      direction: null,
      noteRequired: true,
      allowMultiple: true,
    })

    for (const item of FARE_ADJUSTMENT_KIND_CATALOG.filter(
      (entry) => entry.kind !== FareAdjustmentKind.OTHER,
    )) {
      expect(item.noteRequired).toBe(false)
      expect(item.allowMultiple).toBe(false)
      expect(item.direction).not.toBeNull()
      expect(
        FARE_ADJUSTMENT_KIND_DEFAULT_DIRECTION[
          item.kind as Exclude<FareAdjustmentKind, FareAdjustmentKind.OTHER>
        ],
      ).toBe(item.direction)
    }
  })
})
