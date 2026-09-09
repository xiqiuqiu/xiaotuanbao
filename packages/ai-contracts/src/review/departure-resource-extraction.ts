export const DEPARTURE_RESOURCE_EXTRACTION_CODES = [
  'EXTRACT_TITLE_REQUIRED',
  'EXTRACT_KIND_REQUIRED',
  'KIND_OTHER_BYPASS',
  'SUPPLIER_NOT_IN_EVIDENCE',
  'FREE_SERVICE_FEE_ROW',
] as const

export type DepartureResourceExtractionCode = (typeof DEPARTURE_RESOURCE_EXTRACTION_CODES)[number]

export type DepartureResourceExtractionIssue = {
  code: DepartureResourceExtractionCode
  message: string
}

export type DepartureResourceExtractionCandidate = {
  fieldKey: string
  proposedValue: unknown
  clarity?: 'clear' | 'needs_confirmation' | 'undetermined'
  evidence?: readonly Record<string, unknown>[]
}

const DATE_NOISE =
  /覆盖|日期|期间|全程接待|至|到|—|－|~|～|\d{4}[年./-]\d{1,2}[月./-]\d{1,2}日?|\d{1,2}月\d{1,2}日|\d{1,2}[./]\d{1,2}|金额待确认|金额未知|待确认|总价未知|报价待定|\d+(\.\d+)?\s*元整?/g

const PACKAGE_HINT = /地接|旅行社|接待社|整体承接|打包服务|打包报价|整体报价|打包/
const MULTI_SERVICE_MARKERS = ['住宿', '酒店', '接送', '用餐', '用车', '门票'] as const
const FREE_SERVICE = /欢迎水果|免费赠送|免费提供|赠送水果/g
const EXPLICIT_OTHER_KIND = /种类其他|资源种类其他|种类是其他|种类为其他|种类：其他/

export function evaluateDepartureResourceExtraction(input: {
  candidates: readonly DepartureResourceExtractionCandidate[]
  matchedSupplierName?: string | null
}): DepartureResourceExtractionIssue[] {
  const text = evidenceText(input.candidates)
  const residual = residualNameText(text)
  const issues: DepartureResourceExtractionIssue[] = []

  if (isFreeServiceFeeRow(input.candidates, residual, text)) {
    issues.push({
      code: 'FREE_SERVICE_FEE_ROW',
      message: '明确免费或已包含的服务只记入相关备注，不要单独生成费用行',
    })
    return issues
  }

  if (residual && !hasProposed(input.candidates, 'title')) {
    issues.push({
      code: 'EXTRACT_TITLE_REQUIRED',
      message: `材料已出现资源名称「${residual}」，请提交 title，不要只把日期写入备注`,
    })
  }
  if (residual && !hasProposed(input.candidates, 'resourceKind')) {
    issues.push({
      code: 'EXTRACT_KIND_REQUIRED',
      message: '材料已能识别服务，请提交资源种类；金额未知也不能省略种类',
    })
  }

  const kind = proposedString(input.candidates, 'resourceKind')
  if (kind === 'other' && isAmbiguousPackage(text) && !EXPLICIT_OTHER_KIND.test(text)) {
    issues.push({
      code: 'KIND_OTHER_BYPASS',
      message: '打包或多服务整体报价不要默认为其他；旅行社地接可归拼出，无法明确时先询问',
    })
  }

  if (input.matchedSupplierName && !supplierGroundedInEvidence(input.matchedSupplierName, text)) {
    issues.push({
      code: 'SUPPLIER_NOT_IN_EVIDENCE',
      message: '不要选用材料未出现的供应商；无匹配时不要提交 supplierId，改为询问',
    })
  }

  return issues
}

export function enrichDepartureResourceCandidates<T extends DepartureResourceExtractionCandidate>(
  candidates: readonly T[],
  matchedSupplierName?: string | null,
): T[] {
  const text = evidenceText(candidates)
  const residual = residualNameText(text)
  const evidence = firstEvidence(candidates)
  const next = new Map(candidates.map((candidate) => [candidate.fieldKey, candidate]))

  if (!hasProposed(candidates, 'title')) {
    const title = extractTitle(text, residual)
    if (title) {
      next.set('title', cloneCandidate(candidates[0], 'title', title, evidence))
    }
  }

  if (!hasProposed(candidates, 'resourceKind')) {
    const inferred = inferKind(text)
    if (inferred) {
      next.set('resourceKind', cloneCandidate(candidates[0], 'resourceKind', inferred, evidence))
    }
  }

  if (!hasProposed(candidates, 'amountCents')) {
    const amountCents = parseYuanCents(text)
    if (amountCents) {
      next.set('amountCents', cloneCandidate(candidates[0], 'amountCents', amountCents, evidence))
    }
  }

  if (
    matchedSupplierName &&
    next.has('supplierId') &&
    !supplierGroundedInEvidence(matchedSupplierName, text)
  ) {
    next.delete('supplierId')
  }

  return [...next.values()]
}

function evidenceText(candidates: readonly DepartureResourceExtractionCandidate[]): string {
  return candidates
    .flatMap((candidate) =>
      (candidate.evidence ?? []).map((item) =>
        typeof item.excerpt === 'string' ? item.excerpt.trim() : '',
      ),
    )
    .filter(Boolean)
    .join(' ')
}

function firstEvidence(
  candidates: readonly DepartureResourceExtractionCandidate[],
): readonly Record<string, unknown>[] | undefined {
  return candidates.find((candidate) => candidate.evidence && candidate.evidence.length > 0)?.evidence
}

function cloneCandidate<T extends DepartureResourceExtractionCandidate>(
  sample: T | undefined,
  fieldKey: string,
  proposedValue: unknown,
  evidence: readonly Record<string, unknown>[] | undefined,
): T {
  return {
    ...(sample ?? { fieldKey, proposedValue }),
    fieldKey,
    proposedValue,
    clarity: 'needs_confirmation',
    evidence: evidence ?? sample?.evidence ?? [],
  } as T
}

function extractTitle(text: string, residual: string): string | undefined {
  const quoted =
    text.match(/资源名称[「“"']([^」”"']+)[」”"']/) ??
    text.match(/名称[「“"']([^」”"']+)[」”"']/) ??
    text.match(/名称\s*([^\s，。,]{2,40}全程地接)/)
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 200)
  const named = residual.match(/(?:验收|回测)[\w-]*全程地接|[\dA-Za-z-]*全程地接/)
  if (named?.[0]) return named[0].slice(0, 200)
  if (residual && residual.length <= 40) return residual
  return undefined
}

function inferKind(text: string): 'outsource' | 'insurance' | 'hotel' | 'transport' | 'guide' | 'other' | undefined {
  if (EXPLICIT_OTHER_KIND.test(text)) return 'other'
  if (/保险/.test(text)) return 'insurance'
  if (/地接|旅行社|接待社|打包/.test(text)) return 'outsource'
  if (/酒店|住宿/.test(text)) return 'hotel'
  if (/用车|接送|大巴/.test(text)) return 'transport'
  if (/导游|导服/.test(text)) return 'guide'
  return undefined
}

function yuanToCents(raw: string): number | undefined {
  const yuan = Number(raw)
  if (!Number.isFinite(yuan) || yuan <= 0) return undefined
  const cents = Math.round(yuan * 100)
  return cents >= 1 ? cents : undefined
}

function parseYuanCents(text: string): number | undefined {
  const labeled = text.match(
    /(?:约定总价|约定金额|合计|共计|总价|报价)\s*[为是:：]?\s*(\d+(?:\.\d+)?)\s*元/,
  )
  if (labeled?.[1]) {
    const cents = yuanToCents(labeled[1])
    if (cents != null) return cents
  }

  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*元/g)]
  const primary = matches.filter((match) => {
    const start = match.index ?? 0
    const after = text.slice(start + match[0].length, start + match[0].length + 4)
    const before = text.slice(Math.max(0, start - 2), start)
    if (/^\s*税/.test(after)) return false
    if (/税$/.test(before)) return false
    return true
  })
  const pool = primary.length > 0 ? primary : matches
  let best: number | undefined
  for (const match of pool) {
    const cents = yuanToCents(match[1] ?? '')
    if (cents != null && (best == null || cents > best)) best = cents
  }
  return best
}

function hasProposed(
  candidates: readonly DepartureResourceExtractionCandidate[],
  fieldKey: string,
): boolean {
  const value = candidates.find((candidate) => candidate.fieldKey === fieldKey)?.proposedValue
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

function proposedString(
  candidates: readonly DepartureResourceExtractionCandidate[],
  fieldKey: string,
): string | undefined {
  const value = candidates.find((candidate) => candidate.fieldKey === fieldKey)?.proposedValue
  return typeof value === 'string' ? value.trim() : undefined
}

function residualNameText(text: string): string {
  return text
    .replace(DATE_NOISE, ' ')
    .replace(FREE_SERVICE, ' ')
    .replace(/[\s,，。；;、:：]+/g, ' ')
    .trim()
}

function isAmbiguousPackage(text: string): boolean {
  if (PACKAGE_HINT.test(text)) return true
  return MULTI_SERVICE_MARKERS.filter((marker) => text.includes(marker)).length >= 2
}

function mentionsFreeService(value: string): boolean {
  FREE_SERVICE.lastIndex = 0
  const hit = FREE_SERVICE.test(value)
  FREE_SERVICE.lastIndex = 0
  return hit
}

function isFreeServiceFeeRow(
  candidates: readonly DepartureResourceExtractionCandidate[],
  residual: string,
  text: string,
): boolean {
  if (!mentionsFreeService(text)) return false
  const title = proposedString(candidates, 'title') ?? ''
  const notes = proposedString(candidates, 'notes') ?? ''
  const namedAsFree = mentionsFreeService(title) || (residual === '' && mentionsFreeService(notes))
  const submittedFee =
    hasProposed(candidates, 'amountCents') ||
    hasProposed(candidates, 'resourceKind') ||
    hasProposed(candidates, 'supplierId')
  return namedAsFree && submittedFee
}

function supplierGroundedInEvidence(supplierName: string, text: string): boolean {
  if (!supplierName.trim() || !text) return false
  if (text.includes(supplierName)) return true
  const significant = supplierName
    .replace(/[-—_·\s]/g, '')
    .replace(/有限公司|酒店|宾馆|景区/g, '')
    .replace(/备用|其他|资源/g, '')
  if (significant.length < 2) return false
  for (let index = 0; index <= significant.length - 2; index += 1) {
    if (text.includes(significant.slice(index, index + 2))) return true
  }
  return false
}
