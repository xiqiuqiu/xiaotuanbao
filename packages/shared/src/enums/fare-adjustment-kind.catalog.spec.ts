import {
  FareAdjustmentKind,
} from './fare-adjustment-kind.enum'
import { FARE_ADJUSTMENT_KIND_CATALOG } from './fare-adjustment-kind.catalog'

/**
 * Customer-side kinds in active use. Each must appear as a fixed system kind
 * (not only as free-text custom). Labels may be refined for precision.
 */
const CUSTOMER_REQUIRED_SYSTEM_LABELS = [
  '单房差',
  '儿童门票',
  '学生门票已优惠过',
  '儿童半价门票已优惠过',
  '老人免票或半价已优惠过',
  '不含首晚或末晚住宿',
  '续住',
  '其他补充费用',
] as const

describe('FARE_ADJUSTMENT_KIND_CATALOG covers customer-required kinds', () => {
  it('includes every customer-required system label as a fixed kind', () => {
    const labels = FARE_ADJUSTMENT_KIND_CATALOG.map((item) => item.label)
    for (const required of CUSTOMER_REQUIRED_SYSTEM_LABELS) {
      expect(labels).toContain(required)
    }
  })

  it('locks ticket pre-discount kinds as decrease and room/stay kinds as increase', () => {
    const byLabel = Object.fromEntries(
      FARE_ADJUSTMENT_KIND_CATALOG.map((item) => [item.label, item.direction]),
    )
    expect(byLabel['单房差']).toBe('increase')
    expect(byLabel['儿童门票']).toBe('increase')
    expect(byLabel['续住']).toBe('increase')
    expect(byLabel['其他补充费用']).toBe('increase')
    expect(byLabel['学生门票已优惠过']).toBe('decrease')
    expect(byLabel['儿童半价门票已优惠过']).toBe('decrease')
    expect(byLabel['老人免票或半价已优惠过']).toBe('decrease')
    expect(byLabel['不含首晚或末晚住宿']).toBe('decrease')
  })

  it('keeps custom as a separate multi-row escape hatch outside the fixed catalog', () => {
    expect(FareAdjustmentKind.CUSTOM).toBe('custom')
    expect(FARE_ADJUSTMENT_KIND_CATALOG.map((item) => item.kind as string)).not.toContain(
      'custom',
    )
  })
})
