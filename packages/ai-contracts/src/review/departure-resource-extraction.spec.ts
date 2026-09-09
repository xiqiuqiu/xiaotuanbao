import {
  enrichDepartureResourceCandidates,
  evaluateDepartureResourceExtraction,
} from './departure-resource-extraction'

const GROUND_EVIDENCE =
  '验收450-全程地接，覆盖4月2日至4月6日，金额待确认。打包服务含住宿、接送、用餐。欢迎水果免费赠送。'

function evidence(excerpt: string) {
  return [{ excerpt }] as const
}

describe('发团级资源抽取门禁 #450 回归', () => {
  it('rejects notes-only when the material already names the service', () => {
    const issues = evaluateDepartureResourceExtraction({
      candidates: [
        {
          fieldKey: 'notes',
          proposedValue: '覆盖4月2日至4月6日',
          evidence: evidence(GROUND_EVIDENCE),
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['EXTRACT_TITLE_REQUIRED', 'EXTRACT_KIND_REQUIRED']),
    )
  })

  it('rejects classifying a packaged ground service as other', () => {
    const issues = evaluateDepartureResourceExtraction({
      candidates: [
        {
          fieldKey: 'resourceKind',
          proposedValue: 'other',
          evidence: evidence('打包服务含住宿、接送、用餐，由地接整体报价'),
        },
        {
          fieldKey: 'title',
          proposedValue: '打包服务',
          evidence: evidence('打包服务含住宿、接送、用餐，由地接整体报价'),
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain('KIND_OTHER_BYPASS')
  })

  it('rejects a catalog fallback supplier that never appears in the material', () => {
    const issues = evaluateDepartureResourceExtraction({
      candidates: [
        {
          fieldKey: 'title',
          proposedValue: '打包服务',
          evidence: evidence('打包服务含住宿、接送、用餐'),
        },
        {
          fieldKey: 'resourceKind',
          proposedValue: 'outsource',
          evidence: evidence('打包服务含住宿、接送、用餐'),
        },
        {
          fieldKey: 'supplierId',
          proposedValue: 'sup-fallback',
          evidence: evidence('打包服务含住宿、接送、用餐'),
        },
      ],
      matchedSupplierName: '备用资源-其他类',
    })

    expect(issues.map((issue) => issue.code)).toContain('SUPPLIER_NOT_IN_EVIDENCE')
  })

  it('keeps unknown amount incomplete without inventing zero, and still requires name and kind', () => {
    expect(
      evaluateDepartureResourceExtraction({
        candidates: [
          {
            fieldKey: 'title',
            proposedValue: '验收450-全程地接',
            evidence: evidence('验收450-全程地接，覆盖4月2日至4月6日，金额待确认'),
          },
          {
            fieldKey: 'resourceKind',
            proposedValue: 'outsource',
            evidence: evidence('验收450-全程地接，覆盖4月2日至4月6日，金额待确认'),
          },
          {
            fieldKey: 'notes',
            proposedValue: '覆盖4月2日至4月6日',
            evidence: evidence('验收450-全程地接，覆盖4月2日至4月6日，金额待确认'),
          },
        ],
      }),
    ).toEqual([])
  })

  it('does not invent a fee row for a free welcome fruit, and rejects one if proposed', () => {
    expect(
      evaluateDepartureResourceExtraction({
        candidates: [
          {
            fieldKey: 'notes',
            proposedValue: '欢迎水果免费赠送',
            evidence: evidence('欢迎水果免费赠送'),
          },
        ],
      }),
    ).toEqual([])
    expect(
      evaluateDepartureResourceExtraction({
        candidates: [
          {
            fieldKey: 'title',
            proposedValue: '欢迎水果',
            evidence: evidence('欢迎水果免费赠送'),
          },
          {
            fieldKey: 'resourceKind',
            proposedValue: 'other',
            evidence: evidence('欢迎水果免费赠送'),
          },
          {
            fieldKey: 'amountCents',
            proposedValue: 1,
            evidence: evidence('欢迎水果免费赠送'),
          },
        ],
      }).map((issue) => issue.code),
    ).toContain('FREE_SERVICE_FEE_ROW')
  })

  it('does not treat an explicit 种类其他 plus named fallback supplier as a bypass', () => {
    const excerpt =
      '供应商使用“备用资源-其他类”。资源名称“回测0909-全程地接”，资源种类其他，约定总价860元。这是覆盖2026-08-29到2026-09-01的整体地接费。'
    expect(
      evaluateDepartureResourceExtraction({
        candidates: [
          { fieldKey: 'resourceKind', proposedValue: 'other', evidence: evidence(excerpt) },
          { fieldKey: 'supplierId', proposedValue: 'sup-fallback', evidence: evidence(excerpt) },
          { fieldKey: 'title', proposedValue: '回测0909-全程地接', evidence: evidence(excerpt) },
          { fieldKey: 'amountCents', proposedValue: 86000, evidence: evidence(excerpt) },
        ],
        matchedSupplierName: '备用资源-其他类',
      }).map((issue) => issue.code),
    ).toEqual([])
  })

  it('enriches notes-only 回测0909 copy into title, outsource kind and 860 yuan', () => {
    const excerpt =
      '名称回测0909B-全程地接，这是一条发团级整体费用。约定总价860元。服务日期2026-08-29至2026-09-01。'
    const enriched = enrichDepartureResourceCandidates([
      {
        fieldKey: 'notes',
        proposedValue: '服务日期2026-08-29至2026-09-01',
        evidence: evidence(excerpt),
      },
    ])
    expect(enriched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'title', proposedValue: '回测0909B-全程地接' }),
        expect.objectContaining({ fieldKey: 'resourceKind', proposedValue: 'outsource' }),
        expect.objectContaining({ fieldKey: 'amountCents', proposedValue: 86000 }),
      ]),
    )
  })

  it('enriches the main price when evidence also has a smaller 税 amount in 元', () => {
    const excerpt = '全程包车 8600 元含 50 元税，覆盖 4月2日至4月6日'
    const enriched = enrichDepartureResourceCandidates([
      {
        fieldKey: 'notes',
        proposedValue: '覆盖 4月2日至4月6日',
        evidence: evidence(excerpt),
      },
    ])
    expect(enriched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'amountCents', proposedValue: 860000 }),
      ]),
    )
  })

  it('prefers 约定总价 over a later incidental 元 amount', () => {
    const excerpt = '含 50 元税。约定总价8600元。服务日期2026-08-29至2026-09-01。'
    const enriched = enrichDepartureResourceCandidates([
      {
        fieldKey: 'notes',
        proposedValue: '服务日期2026-08-29至2026-09-01',
        evidence: evidence(excerpt),
      },
    ])
    expect(enriched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'amountCents', proposedValue: 860000 }),
      ]),
    )
  })

  it('accepts a grounded whole-fee proposal with dates only in notes', () => {
    const excerpt = '全程保险 1200 元，覆盖 4月2日至4月6日，挂平安保险'
    expect(
      evaluateDepartureResourceExtraction({
        candidates: [
          { fieldKey: 'resourceKind', proposedValue: 'insurance', evidence: evidence(excerpt) },
          { fieldKey: 'supplierId', proposedValue: 'sup-pingan', evidence: evidence(excerpt) },
          { fieldKey: 'title', proposedValue: '全程旅行保险', evidence: evidence(excerpt) },
          { fieldKey: 'amountCents', proposedValue: 120000, evidence: evidence(excerpt) },
          { fieldKey: 'notes', proposedValue: '覆盖 4月2日至4月6日', evidence: evidence(excerpt) },
        ],
        matchedSupplierName: '平安保险',
      }),
    ).toEqual([])
  })
})
