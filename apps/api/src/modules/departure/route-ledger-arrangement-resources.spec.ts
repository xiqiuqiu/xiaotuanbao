import { ResourceKind } from '@xiaotuanbao/shared'
import { listRouteLedgerCostResources } from './route-ledger-arrangement-resources'

describe('listRouteLedgerCostResources', () => {
  it('returns segment and departure resources excluding outsource', () => {
    const rows = listRouteLedgerCostResources({
      id: 'dep-1',
      itinerarySegments: [
        {
          name: 'D1 乌鲁木齐',
          sortOrder: 1,
          resources: [
            {
              id: 'r1',
              resourceKind: ResourceKind.HOTEL,
              title: '全季 4 间',
              amountCents: 320000,
              notes: null,
              createdAt: new Date('2026-07-01T00:00:00.000Z'),
              partner: null,
              supplier: { name: '全季酒店' },
            },
            {
              id: 'r2',
              resourceKind: ResourceKind.OUTSOURCE,
              title: '拼出',
              amountCents: 100000,
              notes: null,
              createdAt: new Date('2026-07-01T01:00:00.000Z'),
              partner: null,
              supplier: { name: '拼出社' },
            },
          ],
        },
      ],
      departureResources: [
        {
          id: 'r3',
          resourceKind: ResourceKind.TRANSPORT,
          title: '39 座大巴',
          amountCents: 450000,
          notes: '含司机餐补',
          createdAt: new Date('2026-07-01T02:00:00.000Z'),
          partner: null,
          supplier: { name: '顺达车队' },
        },
      ],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      seq: 1,
      segmentLabel: 'D1 乌鲁木齐',
      resourceKindLabel: '酒店',
      title: '全季 4 间',
    })
    expect(rows[1]).toMatchObject({
      seq: 2,
      segmentLabel: '发团级',
      resourceKindLabel: '用车',
    })
  })
})
