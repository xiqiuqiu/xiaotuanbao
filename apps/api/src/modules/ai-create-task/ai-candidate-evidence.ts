import type { SubmitReviewPackageModelInput } from '@xiaotuanbao/ai-contracts'
import { DepartureMaterialParseRunStatus, type Prisma } from '@prisma/client'
import { hasGroundedCandidateEvidence, parseManifestMaterialVersions } from './ai-context-manifest'

export async function hasGroundedManifestCandidateEvidence(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string
    candidates: SubmitReviewPackageModelInput['candidates']
    materialVersions: unknown
    contextManifestId: string
    businessSnapshot: unknown
    userMessages: ReadonlyArray<{ id: string; text: string }>
  },
): Promise<boolean> {
  const pinnedVersions = parseManifestMaterialVersions(input.materialVersions)
  const routeTemplateIds = input.candidates.flatMap((candidate) =>
    candidate.evidence.some((evidence) => evidence.kind === 'system_derivation') &&
    typeof candidate.proposedValue === 'string'
      ? [candidate.proposedValue]
      : [],
  )
  const [parseRuns, routeTemplates, materialReads] = await Promise.all([
    pinnedVersions.length === 0
      ? Promise.resolve([])
      : tx.departureMaterialParseRun.findMany({
          where: {
            organizationId: input.organizationId,
            status: DepartureMaterialParseRunStatus.succeeded,
            OR: pinnedVersions.map((item) => ({
              materialId: item.materialId,
              resultVersion: item.parseResultVersion,
            })),
          },
          select: { materialId: true, resultVersion: true, pages: true },
        }),
    routeTemplateIds.length === 0
      ? Promise.resolve([])
      : tx.routeTemplate.findMany({
          where: { organizationId: input.organizationId, id: { in: routeTemplateIds } },
          select: { id: true, name: true },
        }),
    tx.aiContextMaterialRead.findMany({
      where: {
        organizationId: input.organizationId,
        contextManifestId: input.contextManifestId,
      },
      select: { materialId: true, parseResultVersion: true, pageNumber: true },
    }),
  ])

  return hasGroundedCandidateEvidence(input.candidates, {
    userMessages: input.userMessages,
    materials: parseRuns.map((run) => ({
      materialId: run.materialId,
      parseResultVersion: run.resultVersion,
      pages: parseMaterialPages(run.pages),
    })),
    routeTemplates,
    businessSnapshot: input.businessSnapshot,
    materialReads: new Set(
      materialReads.map(
        (read) => `${read.materialId}:${read.parseResultVersion}:${read.pageNumber}`,
      ),
    ),
  })
}

function parseMaterialPages(value: unknown): Array<{ pageNumber: number; text: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const page = item as Record<string, unknown>
    const pageNumber = Number(page.pageNumber)
    return Number.isInteger(pageNumber) && pageNumber > 0
      ? [{ pageNumber, text: String(page.text ?? '') }]
      : []
  })
}
