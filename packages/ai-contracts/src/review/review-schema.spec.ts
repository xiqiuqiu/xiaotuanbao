import {
  DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
  ReviewSchemaRegistry,
  UnsupportedReviewSchemaError,
  registeredReviewSchemas,
} from './review-schema'

describe('Review Schema Registry #440', () => {
  it('registers the versioned departure basic-info package and field catalog', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema(
      'departure.basic_info_draft@v1',
    )

    expect(schema).toBe(DEPARTURE_BASIC_INFO_REVIEW_SCHEMA)
    expect(schema).toMatchObject({
      schemaId: 'departure.basic_info_draft',
      version: 1,
      targetKind: 'departure_creation_draft',
      confirmationUnits: [
        expect.objectContaining({
          key: 'basic_info_draft',
          fields: expect.arrayContaining([
            expect.objectContaining({
              key: 'name',
              label: '团名',
              control: 'text',
              evidence: expect.objectContaining({
                presentation: 'expandable',
                label: '查看证据',
              }),
              risk: { level: 'standard', label: '普通业务变更' },
            }),
            expect.objectContaining({ key: 'startDate', control: 'date' }),
            expect.objectContaining({
              key: 'departureType',
              label: '发团类型',
              control: 'choice',
              options: [
                { label: '拼团', value: 'combined' },
                { label: '独立团', value: 'independent' },
              ],
            }),
            expect.objectContaining({ key: 'notes', label: '备注' }),
            expect.objectContaining({
              key: 'driverSupplierId',
              label: '司机',
              control: 'reference',
              editable: false,
            }),
            expect.objectContaining({
              key: 'guideSupplierId',
              label: '导游',
              control: 'reference',
              editable: false,
            }),
            expect.objectContaining({ key: 'vehiclePlate', label: '车牌' }),
            expect.objectContaining({ key: 'contactPhone', label: '联系电话' }),
            expect.objectContaining({
              key: 'expectedGuestCountHint',
              control: 'integer',
              number: { min: 0, max: 9999, precision: 0 },
            }),
          ]),
        }),
      ],
    })
  })

  it('validates candidate values through the registered field definitions', () => {
    const schema = registeredReviewSchemas.requireByPayloadSchema(
      'departure.basic_info_draft@v1',
    )

    expect(schema.parseCandidate({
      fieldKey: 'startDate',
      proposedValue: '2026-09-01',
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '九月一日出发' }],
    })).toMatchObject({ fieldKey: 'startDate', proposedValue: '2026-09-01' })
    expect(() => schema.parseCandidate({
      fieldKey: 'startDate',
      proposedValue: '09/01/2026',
      clarity: 'clear',
      status: 'pending',
      evidence: [{ kind: 'user_message', sequence: 1, excerpt: '九月一日出发' }],
    })).toThrow()
  })

  it.each([
    'departure.basic_info_draft@v0',
    'departure.basic_info_draft@v2',
    'partner.profile@v1',
  ])('safely rejects unknown or stale schema %s', (payloadSchema) => {
    expect(registeredReviewSchemas.findByPayloadSchema(payloadSchema)).toBeUndefined()
    expect(() => registeredReviewSchemas.requireByPayloadSchema(payloadSchema)).toThrow(
      UnsupportedReviewSchemaError,
    )
  })

  it('rejects duplicate schema versions at registration time', () => {
    expect(
      () =>
        new ReviewSchemaRegistry([
          DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
          DEPARTURE_BASIC_INFO_REVIEW_SCHEMA,
        ]),
    ).toThrow('重复登记 Review Schema')
  })
})
