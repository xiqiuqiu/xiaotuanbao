import { EVAL_LAYERS } from './catalog'
import {
  BUSINESS_ACCEPTANCE_FIELD_ASSERTION_KINDS,
  BUSINESS_ACCEPTANCE_HARD_GATE_IDS,
  businessAcceptanceEvalCatalog,
} from './business-acceptance-catalog'
import {
  computeCollectionSettlementPreview,
  computeSourceOrderSettlementCents,
  SourceOrderDiscountType,
} from '@xiaotuanbao/shared'
import {
  BUSINESS_ACCEPTANCE_BASELINE_INPUT,
  compareBusinessAcceptanceReports,
  runBusinessAcceptanceEval,
  runBusinessAcceptanceEvalBaseline,
} from './business-acceptance-runner'
import {
  allBusinessAcceptanceMaterials,
  businessAcceptanceFieldMaterials,
  businessAcceptanceMaterials,
} from './business-acceptance-fixtures'

describe('客源与资源业务验收样例 #456', () => {
  it('covers representative materials, field assertions, hard gates and amount samples', () => {
    const ids = businessAcceptanceEvalCatalog.map((scenario) => scenario.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        'material.explicit-total-price',
        'material.ambiguous-attribution',
        'material.same-name-suppliers',
        'material.discount-adjustment',
        'material.incomplete-guest-list',
        'material.ocr-conflict',
        'field.unknown-not-zero',
        'field.explicit-zero',
        'field.human-revision',
        'field.evidence-authentic',
        'hard.unauthorized-access',
        'hard.cross-organization',
        'hard.unreviewed-write',
        'hard.duplicate-business-effect',
        'hard.evidence-forgery',
        'amount.quote-with-adjustments-and-discount',
        'amount.split-balanced-collection',
        'amount.split-overcollect-rebate',
        'amount.guest-only-deposit-and-topup',
        'amount.zero-settlement-no-receivable',
        'model.extraction-quality',
      ]),
    )
    expect(businessAcceptanceEvalCatalog.every((scenario) => scenario.version === 1)).toBe(true)
    expect(new Set(businessAcceptanceEvalCatalog.map((scenario) => scenario.layer))).toEqual(
      new Set(EVAL_LAYERS),
    )
    expect(BUSINESS_ACCEPTANCE_FIELD_ASSERTION_KINDS).toEqual([
      'unknown',
      'zero',
      'human_revision',
      'evidence',
    ])
    expect(BUSINESS_ACCEPTANCE_HARD_GATE_IDS).toEqual([
      'hard.unauthorized-access',
      'hard.cross-organization',
      'hard.unreviewed-write',
      'hard.duplicate-business-effect',
      'hard.evidence-forgery',
    ])
  })

  it('keeps desensitized materials for the six representative cases', () => {
    expect(businessAcceptanceMaterials.map((item) => item.id)).toEqual([
      'material.explicit-total-price',
      'material.ambiguous-attribution',
      'material.same-name-suppliers',
      'material.discount-adjustment',
      'material.incomplete-guest-list',
      'material.ocr-conflict',
    ])
    for (const material of allBusinessAcceptanceMaterials()) {
      expect(material.body.trim().length).toBeGreaterThan(20)
      expect(material.body).not.toMatch(/\d{11}/)
      expect(material.body).not.toMatch(/\d{17}[\dXx]/)
    }
    expect(businessAcceptanceFieldMaterials[0]?.body).toContain('未写儿童、团款调整或优惠')
  })

  it('reports unknown, zero, human revision and evidence as separate assertions', () => {
    const report = runBusinessAcceptanceEval({
      ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
      observations: {
        ...BUSINESS_ACCEPTANCE_BASELINE_INPUT.observations,
        'field.unknown-not-zero': {
          fields: [
            { fieldKey: 'childGuestCount', valueKind: 'zero', proposedValue: 0 },
            { fieldKey: 'discountType', valueKind: 'zero', proposedValue: 'none' },
            { fieldKey: 'fareAdjustments', valueKind: 'zero', proposedValue: [] },
          ],
        },
      },
    })

    expect(report.verdict).toBe('fail')
    expect(report.fieldAssertions.unknown.passed).toBe(false)
    expect(report.fieldAssertions.zero.passed).toBe(true)
    expect(report.fieldAssertions.humanRevision.passed).toBe(true)
    expect(report.fieldAssertions.evidence.passed).toBe(true)
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'field.unknown-not-zero', layer: 'deterministic' }),
      ]),
    )
  })

  it('fails hard gates with zero tolerance even when the model score is perfect', () => {
    const report = runBusinessAcceptanceEval({
      ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
      observations: {
        ...BUSINESS_ACCEPTANCE_BASELINE_INPUT.observations,
        'hard.unreviewed-write': { hard: { blocked: false, wroteBusiness: true } },
        'model.extraction-quality': { modelScore: 1 },
      },
      hardAssertions: BUSINESS_ACCEPTANCE_BASELINE_INPUT.hardAssertions.map((item) =>
        item.id === 'hard.unreviewed-write' ? { ...item, passed: false } : item,
      ),
      modelScore: { judgeVersion: 'eval-judge@1', score: 1, notes: 'fluent extraction' },
    })

    expect(report.verdict).toBe('fail')
    expect(report.layers.hard.passed).toBe(false)
    expect(report.layers.hard.sampleSize).toBe(BUSINESS_ACCEPTANCE_HARD_GATE_IDS.length)
    expect(report.layers.model.considered).toBe(false)
    expect(report.layers.model.overrodeHardAssertions).toBe(false)
    expect(report.layers.model.score).toBe(1)
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'hard.unreviewed-write', layer: 'hard' }),
      ]),
    )
  })

  it('reports model extraction separately and does not fail the run on model score', () => {
    const report = runBusinessAcceptanceEval({
      ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
      observations: {
        ...BUSINESS_ACCEPTANCE_BASELINE_INPUT.observations,
        'model.extraction-quality': { modelScore: 0.12 },
      },
      modelScore: { judgeVersion: 'eval-judge@1', score: 0.12, notes: 'weak OCR' },
    })

    expect(report.verdict).toBe('pass')
    expect(report.layers.deterministic.passed).toBe(true)
    expect(report.layers.golden.passed).toBe(true)
    expect(report.layers.model.considered).toBe(true)
    expect(report.layers.model.overrodeHardAssertions).toBe(false)
    expect(report.layers.model.score).toBe(0.12)
    expect(report.failures).toEqual([])
  })

  it('reproduces the spec quote and collection-path amounts from the domain settlement function', () => {
    expect(
      computeSourceOrderSettlementCents({
        adultGuestCount: 8,
        childGuestCount: 2,
        adultUnitPriceCents: 680_000,
        childUnitPriceCents: 420_000,
        discountType: SourceOrderDiscountType.LUMP_SUM,
        discountCents: 200_000,
        fareAdjustments: [
          { direction: 'increase', amountCents: 60_000 },
          { direction: 'decrease', amountCents: 40_000 },
        ],
      }),
    ).toEqual({
      grossReceivableCents: 6_280_000,
      fareAdjustmentNetCents: 20_000,
      discountCents: 200_000,
      netReceivableCents: 6_100_000,
    })
    expect(computeCollectionSettlementPreview(6_100_000, 4_100_000)).toEqual({
      estimatedCustomerTopUpCents: 2_000_000,
      estimatedRebateCents: 0,
    })
    expect(computeCollectionSettlementPreview(6_100_000, 6_500_000)).toEqual({
      estimatedCustomerTopUpCents: 0,
      estimatedRebateCents: 400_000,
    })
    expect(computeCollectionSettlementPreview(6_100_000, 1_000_000)).toEqual({
      estimatedCustomerTopUpCents: 5_100_000,
      estimatedRebateCents: 0,
    })
  })

  it('fails when a material no longer contains its quoted facts', () => {
    const tampered = allBusinessAcceptanceMaterials().map((item) =>
      item.id === 'material.explicit-total-price'
        ? { ...item, body: item.body.replaceAll('8800', '1') }
        : item,
    )
    const report = runBusinessAcceptanceEval({
      ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
      materials: tampered,
    })
    expect(report.verdict).toBe('fail')
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'material.explicit-total-price' }),
      ]),
    )
  })

  it('fails when an unreviewed write observation claims a business effect', () => {
    const report = runBusinessAcceptanceEval({
      ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
      observations: {
        ...BUSINESS_ACCEPTANCE_BASELINE_INPUT.observations,
        'hard.unreviewed-write': { hard: { blocked: false, wroteBusiness: true } },
      },
    })
    expect(report.verdict).toBe('fail')
    expect(report.layers.hard.passed).toBe(false)
  })

  it('repeats the baseline to a comparable layered report', () => {
    const first = runBusinessAcceptanceEvalBaseline()
    const second = runBusinessAcceptanceEval(BUSINESS_ACCEPTANCE_BASELINE_INPUT)

    expect(first.verdict).toBe('pass')
    expect(first.fieldAssertions.unknown.passed).toBe(true)
    expect(first.fieldAssertions.zero.passed).toBe(true)
    expect(first.fieldAssertions.humanRevision.passed).toBe(true)
    expect(first.fieldAssertions.evidence.passed).toBe(true)
    expect(first.layers.hard.passed).toBe(true)
    expect(compareBusinessAcceptanceReports(first, second)).toEqual({ equal: true, diffs: [] })
  })
})

