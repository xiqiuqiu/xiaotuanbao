import { registeredReviewSchemas } from './review-schema'
import { requiredPermissionKeyForReviewPayloadSchema } from './source-order-receivable-schema'
import {
  RESOURCE_PAYABLE_REVIEW_SCHEMA,
  parseResourcePayableReviewCandidate,
  resourcePayableReviewCandidates,
} from './resource-payable-schema'

const evidence = [{ kind: 'system_derivation' as const, rule: '正式资源当前约定应付' }]

describe('resource payable review schema #452', () => {
  it('registers a versioned per-resource payable package against an existing departure', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema('resource.payable@v1')

    expect(schema).toBe(RESOURCE_PAYABLE_REVIEW_SCHEMA)
    expect(schema).toMatchObject({
      schemaId: 'resource.payable',
      version: 1,
      targetKind: 'departure',
      confirmationUnits: [
        expect.objectContaining({
          key: 'resource_payable',
          label: '初始应付审核',
          targetLabel: '所选资源约定应付',
        }),
      ],
    })
    expect(schema.confirmationUnits[0]?.fields.every((field) => field.editable === false)).toBe(true)
    expect(schema.confirmationUnits[0]?.fields.map((field) => field.key)).toEqual([
      'sourceType',
      'sourceId',
      'title',
      'resourceKind',
      'supplierName',
      'amountCents',
      'historyStatus',
      'historyMessage',
    ])
  })

  it('keeps one resource as one confirmation unit instead of a segment batch', () => {
    const candidates = resourcePayableReviewCandidates({
      sourceType: 'segment_resource',
      sourceId: 'res-1',
      title: '4月2日住宿',
      resourceKind: 'hotel',
      supplierName: '关西酒店',
      amountCents: 880_000,
      classification: { status: 'ready', amountCents: 880_000 },
    })
    const sourceId = candidates.find((candidate) => candidate.fieldKey === 'sourceId')?.proposedValue
    const amount = candidates.find((candidate) => candidate.fieldKey === 'amountCents')?.proposedValue

    expect(sourceId).toBe('res-1')
    expect(amount).toBe(880_000)
    expect(
      parseResourcePayableReviewCandidate({
        fieldKey: 'sourceId',
        proposedValue: sourceId,
        clarity: 'clear',
        evidence,
      }).proposedValue,
    ).toBe('res-1')
    expect(
      parseResourcePayableReviewCandidate({
        fieldKey: 'amountCents',
        proposedValue: 0,
        clarity: 'clear',
        evidence,
      }).proposedValue,
    ).toBe(0)
  })

  it('authorizes initial payable confirm with /departure instead of departure:write', () => {
    expect(requiredPermissionKeyForReviewPayloadSchema('resource.payable@v1')).toBe('/departure')
    expect(requiredPermissionKeyForReviewPayloadSchema('source_order.receivable@v1')).toBe(
      '/departure',
    )
    expect(requiredPermissionKeyForReviewPayloadSchema('departure.segment_resource@v1')).toBe(
      'departure:write',
    )
  })
})
