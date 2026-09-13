import type { EvalScenario } from './catalog'
import type { EvalFailure, HardAssertionResult, ModelScore } from './runner'
import {
  BUSINESS_ACCEPTANCE_HARD_GATE_IDS,
  BUSINESS_ACCEPTANCE_HARD_GATE_KINDS,
  businessAcceptanceEvalCatalog,
  type BusinessAcceptanceScenarioId,
} from './business-acceptance-catalog'
import { businessAcceptanceMaterials } from './business-acceptance-fixtures'

export interface BusinessAcceptanceFieldObservation {
  fieldKey: string
  valueKind: 'unknown' | 'zero' | 'provided'
  proposedValue?: unknown
  clarity?: 'clear' | 'needs_confirmation' | 'undetermined'
  humanRevised?: boolean
  evidenceAuthentic?: boolean
}

export interface BusinessAcceptanceAmountObservation {
  grossReceivableCents?: number
  fareAdjustmentNetCents?: number
  discountCents?: number
  netReceivableCents?: number
  partnerCollectedCents?: number
  guestCollectCents?: number
  estimatedCustomerTopUpCents?: number
  estimatedRebateCents?: number
  receivablePaths?: readonly { sourceType: string; amountCents: number }[]
}

export interface BusinessAcceptanceHardObservation {
  blocked: boolean
  wroteBusiness: boolean
  duplicateEffect?: boolean
  authentic?: boolean
}

export interface BusinessAcceptanceObservation {
  fields?: readonly BusinessAcceptanceFieldObservation[]
  amounts?: BusinessAcceptanceAmountObservation
  hard?: BusinessAcceptanceHardObservation
  inventsRoomType?: boolean
  autoMatchedSupplier?: boolean
  guestCount?: number
  recordedGuestCount?: number
  writesIncompleteNames?: boolean
  changesGuestCount?: boolean
  emptyPhoneBlocks?: boolean
  remainderPending?: boolean
  retainsCandidates?: boolean
  assignsViewingDate?: boolean
  itemKind?: 'source_order' | 'segment_resource' | 'departure_resource'
  itemKindClarity?: 'clear' | 'needs_confirmation' | 'undetermined'
  blocksWhenPOrGExceedsS?: boolean
  conflictingAmountsCents?: readonly number[]
  evidenceExcerpt?: string
  evidenceMaterialId?: string
  modelScore?: number
}

export interface BusinessAcceptanceEvalInput {
  catalog: readonly EvalScenario[]
  observations: Record<BusinessAcceptanceScenarioId, BusinessAcceptanceObservation>
  hardAssertions: readonly HardAssertionResult[]
  modelScore: ModelScore
}

export interface BusinessAcceptanceFieldAssertionReport {
  unknown: { passed: boolean; sampleSize: number }
  zero: { passed: boolean; sampleSize: number }
  humanRevision: { passed: boolean; sampleSize: number }
  evidence: { passed: boolean; sampleSize: number }
}

export interface BusinessAcceptanceEvalReport {
  catalogVersion: 1
  verdict: 'pass' | 'fail'
  layers: {
    hard: { passed: boolean; sampleSize: number }
    deterministic: { passed: boolean; sampleSize: number }
    golden: { passed: boolean; sampleSize: number }
    model: { considered: boolean; overrodeHardAssertions: false; score: number }
  }
  fieldAssertions: BusinessAcceptanceFieldAssertionReport
  failures: EvalFailure[]
}

export function computeAcceptanceSettlement(input: {
  adultGuestCount: number
  childGuestCount: number
  adultUnitPriceCents: number
  childUnitPriceCents: number
  fareAdjustments: readonly { direction: 'increase' | 'decrease'; amountCents: number }[]
  discountCents: number
}): {
  grossReceivableCents: number
  fareAdjustmentNetCents: number
  discountCents: number
  netReceivableCents: number
} {
  const grossReceivableCents =
    input.adultGuestCount * input.adultUnitPriceCents +
    input.childGuestCount * input.childUnitPriceCents
  const fareAdjustmentNetCents = input.fareAdjustments.reduce((net, item) => {
    return item.direction === 'increase' ? net + item.amountCents : net - item.amountCents
  }, 0)
  return {
    grossReceivableCents,
    fareAdjustmentNetCents,
    discountCents: input.discountCents,
    netReceivableCents: grossReceivableCents + fareAdjustmentNetCents - input.discountCents,
  }
}

export function computeAcceptanceCollectionPreview(
  netReceivableCents: number,
  guestCollectCents: number,
): { estimatedCustomerTopUpCents: number; estimatedRebateCents: number } {
  return {
    estimatedCustomerTopUpCents: Math.max(0, netReceivableCents - guestCollectCents),
    estimatedRebateCents: Math.max(0, guestCollectCents - netReceivableCents),
  }
}

export function runBusinessAcceptanceEval(
  input: BusinessAcceptanceEvalInput,
): BusinessAcceptanceEvalReport {
  const failures: EvalFailure[] = []

  for (const assertion of input.hardAssertions) {
    if (!assertion.passed) {
      failures.push({ id: assertion.id, layer: 'hard' })
    }
  }

  for (const scenario of input.catalog) {
    if (scenario.layer === 'model') continue
    const observation = input.observations[scenario.id as BusinessAcceptanceScenarioId]
    if (!observation || !scenarioMatches(scenario, observation)) {
      failures.push({ id: scenario.id, layer: scenario.layer })
    }
  }

  const hardFailed = failures.some((item) => item.layer === 'hard')
  const deterministicFailed = failures.some((item) => item.layer === 'deterministic')
  const goldenFailed = failures.some((item) => item.layer === 'golden')

  return {
    catalogVersion: 1,
    verdict: hardFailed || deterministicFailed || goldenFailed ? 'fail' : 'pass',
    layers: {
      hard: {
        passed: !hardFailed,
        sampleSize: input.hardAssertions.length,
      },
      deterministic: {
        passed: !deterministicFailed,
        sampleSize: input.catalog.filter((scenario) => scenario.layer === 'deterministic').length,
      },
      golden: {
        passed: !goldenFailed,
        sampleSize: input.catalog.filter((scenario) => scenario.layer === 'golden').length,
      },
      model: {
        considered: !hardFailed,
        overrodeHardAssertions: false,
        score: input.modelScore.score,
      },
    },
    fieldAssertions: {
      unknown: fieldAssertionReport(failures, 'field.unknown-not-zero', 3),
      zero: fieldAssertionReport(failures, 'field.explicit-zero', 2),
      humanRevision: fieldAssertionReport(failures, 'field.human-revision', 1),
      evidence: fieldAssertionReport(failures, 'field.evidence-authentic', 1),
    },
    failures,
  }
}

export const BUSINESS_ACCEPTANCE_BASELINE_INPUT: BusinessAcceptanceEvalInput = {
  catalog: businessAcceptanceEvalCatalog,
  observations: baselineObservations(),
  hardAssertions: BUSINESS_ACCEPTANCE_HARD_GATE_IDS.map((id) => ({
    id,
    passed: true,
    kind: BUSINESS_ACCEPTANCE_HARD_GATE_KINDS[id],
  })),
  modelScore: { judgeVersion: 'eval-judge@1', score: 0.64, notes: 'extraction reported separately' },
}

export function runBusinessAcceptanceEvalBaseline(): BusinessAcceptanceEvalReport {
  return runBusinessAcceptanceEval(BUSINESS_ACCEPTANCE_BASELINE_INPUT)
}

function fieldAssertionReport(
  failures: readonly EvalFailure[],
  id: string,
  sampleSize: number,
): { passed: boolean; sampleSize: number } {
  return {
    passed: !failures.some((item) => item.id === id),
    sampleSize,
  }
}

function scenarioMatches(
  scenario: EvalScenario,
  observation: BusinessAcceptanceObservation,
): boolean {
  const expected = scenario.expect
  switch (scenario.id) {
    case 'material.explicit-total-price':
      return (
        observation.inventsRoomType === false &&
        hasField(observation, 'amountCents', 'provided', expected.amountCents)
      )
    case 'material.ambiguous-attribution':
      return (
        observation.itemKind === expected.itemKind &&
        observation.itemKindClarity === expected.itemKindClarity &&
        observation.assignsViewingDate === false
      )
    case 'material.same-name-suppliers':
      return (
        observation.autoMatchedSupplier === false &&
        observation.retainsCandidates === true &&
        hasField(observation, 'supplierId', 'unknown') &&
        observation.fields?.some(
          (field) => field.fieldKey === 'supplierId' && field.clarity === expected.clarity,
        ) === true
      )
    case 'material.discount-adjustment':
      return amountsMatch(observation.amounts, expected)
    case 'material.incomplete-guest-list':
      return (
        observation.guestCount === expected.guestCount &&
        observation.recordedGuestCount === expected.recordedGuestCount &&
        observation.writesIncompleteNames === false &&
        observation.changesGuestCount === false &&
        observation.emptyPhoneBlocks === false &&
        observation.remainderPending === true
      )
    case 'material.ocr-conflict':
      return (
        hasField(observation, 'amountCents', 'unknown') &&
        observation.fields?.some(
          (field) => field.fieldKey === 'amountCents' && field.clarity === expected.clarity,
        ) === true &&
        arraysEqual(
          observation.conflictingAmountsCents ?? [],
          expected.conflictingAmountsCents as readonly number[],
        )
      )
    case 'field.unknown-not-zero':
      return fieldsHaveValueKind(observation, expected.fields as readonly string[], 'unknown')
    case 'field.explicit-zero':
      return fieldsHaveValueKind(observation, expected.fields as readonly string[], 'zero')
    case 'field.human-revision':
      return (
        observation.fields?.some(
          (field) =>
            field.fieldKey === expected.fieldKey &&
            field.humanRevised === true &&
            field.proposedValue === expected.afterCents,
        ) === true &&
        observation.conflictingAmountsCents?.[0] === expected.beforeCents
      )
    case 'field.evidence-authentic':
      return evidenceMatchesMaterial(observation, expected)
    case 'hard.unauthorized-access':
    case 'hard.cross-organization':
    case 'hard.unreviewed-write':
      return (
        observation.hard?.blocked === true && observation.hard.wroteBusiness === false
      )
    case 'hard.duplicate-business-effect':
      return (
        observation.hard?.wroteBusiness === false &&
        observation.hard.duplicateEffect === false
      )
    case 'hard.evidence-forgery':
      return (
        observation.hard?.blocked === true &&
        observation.hard.wroteBusiness === false &&
        observation.hard.authentic === false
      )
    case 'amount.quote-with-adjustments-and-discount':
    case 'amount.split-balanced-collection':
    case 'amount.guest-only-deposit-and-topup':
    case 'amount.zero-settlement-no-receivable':
      return amountsMatch(observation.amounts, expected)
    case 'amount.split-overcollect-rebate':
      return (
        amountsMatch(observation.amounts, expected) &&
        observation.blocksWhenPOrGExceedsS === false
      )
    default:
      return false
  }
}

function hasField(
  observation: BusinessAcceptanceObservation,
  fieldKey: string,
  valueKind: BusinessAcceptanceFieldObservation['valueKind'],
  proposedValue?: unknown,
): boolean {
  return (
    observation.fields?.some(
      (field) =>
        field.fieldKey === fieldKey &&
        field.valueKind === valueKind &&
        (proposedValue === undefined || field.proposedValue === proposedValue),
    ) === true
  )
}

function fieldsHaveValueKind(
  observation: BusinessAcceptanceObservation,
  fieldKeys: readonly string[],
  valueKind: BusinessAcceptanceFieldObservation['valueKind'],
): boolean {
  return fieldKeys.every((fieldKey) => hasField(observation, fieldKey, valueKind))
}

function amountsMatch(
  actual: BusinessAcceptanceAmountObservation | undefined,
  expected: Record<string, unknown>,
): boolean {
  if (!actual) return false
  const keys = [
    'grossReceivableCents',
    'fareAdjustmentNetCents',
    'discountCents',
    'netReceivableCents',
    'partnerCollectedCents',
    'guestCollectCents',
    'estimatedCustomerTopUpCents',
    'estimatedRebateCents',
  ] as const
  for (const key of keys) {
    if (key in expected && actual[key] !== expected[key]) return false
  }
  if ('receivablePaths' in expected) {
    return (
      JSON.stringify(actual.receivablePaths ?? []) === JSON.stringify(expected.receivablePaths)
    )
  }
  return true
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function evidenceMatchesMaterial(
  observation: BusinessAcceptanceObservation,
  expected: Record<string, unknown>,
): boolean {
  const excerpt = observation.evidenceExcerpt
  const materialId = observation.evidenceMaterialId
  if (
    observation.fields?.every((field) => field.evidenceAuthentic === true) !== true ||
    excerpt !== expected.excerpt ||
    materialId !== expected.materialId
  ) {
    return false
  }
  const material = businessAcceptanceMaterials.find((item) => item.id === materialId)
  return Boolean(excerpt && material?.body.includes(excerpt))
}

export function compareBusinessAcceptanceReports(
  left: BusinessAcceptanceEvalReport,
  right: BusinessAcceptanceEvalReport,
): { equal: boolean; diffs: string[] } {
  const diffs: string[] = []
  if (left.verdict !== right.verdict) diffs.push(`verdict:${left.verdict}->${right.verdict}`)
  if (left.catalogVersion !== right.catalogVersion) {
    diffs.push(`catalogVersion:${left.catalogVersion}->${right.catalogVersion}`)
  }
  if (JSON.stringify(left.layers) !== JSON.stringify(right.layers)) diffs.push('layers')
  if (JSON.stringify(left.fieldAssertions) !== JSON.stringify(right.fieldAssertions)) {
    diffs.push('fieldAssertions')
  }
  if (JSON.stringify(left.failures) !== JSON.stringify(right.failures)) diffs.push('failures')
  return { equal: diffs.length === 0, diffs }
}

function baselineObservations(): Record<BusinessAcceptanceScenarioId, BusinessAcceptanceObservation> {
  return {
    'material.explicit-total-price': {
      inventsRoomType: false,
      fields: [{ fieldKey: 'amountCents', valueKind: 'provided', proposedValue: 880_000 }],
    },
    'material.ambiguous-attribution': {
      itemKind: 'departure_resource',
      itemKindClarity: 'needs_confirmation',
      assignsViewingDate: false,
    },
    'material.same-name-suppliers': {
      autoMatchedSupplier: false,
      retainsCandidates: true,
      fields: [
        {
          fieldKey: 'supplierId',
          valueKind: 'unknown',
          proposedValue: null,
          clarity: 'needs_confirmation',
        },
      ],
    },
    'material.discount-adjustment': {
      amounts: {
        grossReceivableCents: 6_280_000,
        fareAdjustmentNetCents: 20_000,
        discountCents: 200_000,
        netReceivableCents: 6_100_000,
      },
    },
    'material.incomplete-guest-list': {
      guestCount: 10,
      recordedGuestCount: 8,
      writesIncompleteNames: false,
      changesGuestCount: false,
      emptyPhoneBlocks: false,
      remainderPending: true,
    },
    'material.ocr-conflict': {
      conflictingAmountsCents: [980_000, 880_000],
      fields: [
        {
          fieldKey: 'amountCents',
          valueKind: 'unknown',
          proposedValue: null,
          clarity: 'needs_confirmation',
        },
      ],
    },
    'field.unknown-not-zero': {
      fields: [
        { fieldKey: 'childGuestCount', valueKind: 'unknown', proposedValue: null },
        { fieldKey: 'discountType', valueKind: 'unknown', proposedValue: null },
        { fieldKey: 'fareAdjustments', valueKind: 'unknown', proposedValue: null },
      ],
    },
    'field.explicit-zero': {
      fields: [
        { fieldKey: 'discountCents', valueKind: 'zero', proposedValue: 0 },
        { fieldKey: 'adultGuestCount', valueKind: 'zero', proposedValue: 0 },
      ],
    },
    'field.human-revision': {
      conflictingAmountsCents: [980_000, 880_000],
      fields: [
        {
          fieldKey: 'amountCents',
          valueKind: 'provided',
          proposedValue: 880_000,
          humanRevised: true,
        },
      ],
    },
    'field.evidence-authentic': {
      evidenceMaterialId: 'material.discount-adjustment',
      evidenceExcerpt: '整单优惠 2000 元',
      fields: [{ fieldKey: 'amountCents', valueKind: 'provided', evidenceAuthentic: true }],
    },
    'hard.unauthorized-access': {
      hard: { blocked: true, wroteBusiness: false },
    },
    'hard.cross-organization': {
      hard: { blocked: true, wroteBusiness: false },
    },
    'hard.unreviewed-write': {
      hard: { blocked: true, wroteBusiness: false },
    },
    'hard.duplicate-business-effect': {
      hard: { blocked: false, wroteBusiness: false, duplicateEffect: false },
    },
    'hard.evidence-forgery': {
      hard: { blocked: true, wroteBusiness: false, authentic: false },
    },
    'amount.quote-with-adjustments-and-discount': {
      amounts: computeAcceptanceSettlement({
        adultGuestCount: 8,
        childGuestCount: 2,
        adultUnitPriceCents: 680_000,
        childUnitPriceCents: 420_000,
        fareAdjustments: [
          { direction: 'increase', amountCents: 60_000 },
          { direction: 'decrease', amountCents: 40_000 },
        ],
        discountCents: 200_000,
      }),
    },
    'amount.split-balanced-collection': {
      amounts: {
        netReceivableCents: 6_100_000,
        partnerCollectedCents: 2_000_000,
        guestCollectCents: 4_100_000,
        ...computeAcceptanceCollectionPreview(6_100_000, 4_100_000),
        receivablePaths: [
          { sourceType: 'source_order_guest_balance_collection', amountCents: 4_100_000 },
          { sourceType: 'source_order_customer_settlement', amountCents: 2_000_000 },
        ],
      },
    },
    'amount.split-overcollect-rebate': {
      blocksWhenPOrGExceedsS: false,
      amounts: {
        netReceivableCents: 6_100_000,
        partnerCollectedCents: 8_000_000,
        guestCollectCents: 6_500_000,
        ...computeAcceptanceCollectionPreview(6_100_000, 6_500_000),
        receivablePaths: [
          { sourceType: 'source_order_guest_balance_collection', amountCents: 6_500_000 },
        ],
      },
    },
    'amount.guest-only-deposit-and-topup': {
      amounts: {
        netReceivableCents: 6_100_000,
        guestCollectCents: 1_000_000,
        ...computeAcceptanceCollectionPreview(6_100_000, 1_000_000),
        receivablePaths: [
          { sourceType: 'source_order_guest_deposit_collection', amountCents: 1_000_000 },
          { sourceType: 'source_order_customer_settlement', amountCents: 5_100_000 },
        ],
      },
    },
    'amount.zero-settlement-no-receivable': {
      amounts: {
        netReceivableCents: 0,
        receivablePaths: [],
      },
    },
    'model.extraction-quality': {
      modelScore: 0.64,
    },
  }
}

export { businessAcceptanceEvalCatalog }
