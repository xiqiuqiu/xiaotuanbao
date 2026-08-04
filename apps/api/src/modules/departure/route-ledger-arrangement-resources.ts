import {
  RESOURCE_KIND_LABELS,
  ResourceKind,
  type RouteLedgerResourceRow,
} from '@xiaotuanbao/shared'

type SegmentResourceRow = {
  id: string
  resourceKind: string
  title: string
  amountCents: number
  notes: string | null
  createdAt: Date
  partner: { name: string } | null
  supplier: { name: string } | null
}

type DepartureResourceInput = {
  id: string
  departureResources: SegmentResourceRow[]
  itinerarySegments: Array<{
    name: string
    sortOrder: number
    resources: SegmentResourceRow[]
  }>
}

function resolveSupplierName(resource: SegmentResourceRow): string {
  return resource.partner?.name ?? resource.supplier?.name ?? '-'
}

function toResourceRow(input: {
  resource: SegmentResourceRow
  segmentLabel: string
  seq: number
}): RouteLedgerResourceRow {
  const { resource, segmentLabel, seq } = input
  return {
    id: resource.id,
    seq,
    segmentLabel,
    resourceKindLabel:
      RESOURCE_KIND_LABELS[resource.resourceKind as ResourceKind] ?? resource.resourceKind,
    title: resource.title,
    supplierName: resolveSupplierName(resource),
    amountCents: resource.amountCents,
    notes: resource.notes,
  }
}

/** 执行成本资源（不含拼出），顺序与导出 Excel 资源区一致。 */
export function listRouteLedgerCostResources(
  departure: DepartureResourceInput,
): RouteLedgerResourceRow[] {
  const rows: RouteLedgerResourceRow[] = []
  let seq = 0

  const segments = [...departure.itinerarySegments].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )
  for (const segment of segments) {
    const segmentResources = [...segment.resources].sort((left, right) => {
      const byTime = left.createdAt.getTime() - right.createdAt.getTime()
      return byTime !== 0 ? byTime : left.id.localeCompare(right.id)
    })
    for (const resource of segmentResources) {
      if (resource.resourceKind === ResourceKind.OUTSOURCE) {
        continue
      }
      seq += 1
      rows.push(
        toResourceRow({
          resource,
          segmentLabel: segment.name,
          seq,
        }),
      )
    }
  }

  const departureResources = [...departure.departureResources].sort((left, right) => {
    const byTime = left.createdAt.getTime() - right.createdAt.getTime()
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id)
  })
  for (const resource of departureResources) {
    if (resource.resourceKind === ResourceKind.OUTSOURCE) {
      continue
    }
    seq += 1
    rows.push(
      toResourceRow({
        resource,
        segmentLabel: '发团级',
        seq,
      }),
    )
  }

  return rows
}
