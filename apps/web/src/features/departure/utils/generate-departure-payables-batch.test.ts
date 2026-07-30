import { describe, expect, it, vi } from 'vitest'
import { SegmentPayableStatus } from '@xiaotuanbao/shared'
import { generateDeparturePayablesBatch } from './generate-departure-payables-batch'

const { generateDeparturePayable } = vi.hoisted(() => ({
  generateDeparturePayable: vi.fn(),
}))

vi.mock('@/services/departure-resource.service', () => ({
  generateDeparturePayable,
}))

describe('generateDeparturePayablesBatch', () => {
  it('generates only 未生成且金额>0 departure resources', async () => {
    generateDeparturePayable.mockResolvedValue({ sourceAmountMismatch: false })

    const result = await generateDeparturePayablesBatch([
      {
        id: 'a',
        title: '用车',
        amountCents: 100_000,
        payableStatus: SegmentPayableStatus.NOT_GENERATED,
      },
      {
        id: 'b',
        title: '保险',
        amountCents: 0,
        payableStatus: SegmentPayableStatus.NOT_GENERATED,
      },
      {
        id: 'c',
        title: '导游',
        amountCents: 50_000,
        payableStatus: SegmentPayableStatus.PENDING,
      },
    ])

    expect(generateDeparturePayable).toHaveBeenCalledTimes(1)
    expect(generateDeparturePayable).toHaveBeenCalledWith('a')
    expect(result).toMatchObject({
      attempted: 1,
      succeeded: 1,
      generated: 1,
      failed: 0,
    })
  })

  it('records per-row failures without aborting the batch', async () => {
    generateDeparturePayable
      .mockResolvedValueOnce({ sourceAmountMismatch: false })
      .mockRejectedValueOnce(new Error('供应商停用'))

    const result = await generateDeparturePayablesBatch([
      {
        id: 'ok',
        title: '用车',
        amountCents: 10_000,
        payableStatus: SegmentPayableStatus.NOT_GENERATED,
      },
      {
        id: 'bad',
        title: '保险',
        amountCents: 20_000,
        payableStatus: SegmentPayableStatus.NOT_GENERATED,
      },
    ])

    expect(result).toMatchObject({
      attempted: 2,
      succeeded: 1,
      failed: 1,
      generated: 1,
    })
    expect(result.items[1]).toMatchObject({
      sourceId: 'bad',
      outcome: 'failed',
      reason: '供应商停用',
    })
  })
})
