import { ConflictException } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import {
  DirectoryProfileStatus,
  PartnerKind,
  PartnerType,
  PrismaClient,
  SourceOrderCollectionMode,
  type AiReviewPackage,
  type Prisma,
} from '@prisma/client'
import { PaymentScheduleSourceType } from '@xiaotuanbao/shared'
import { ReviewCollaborationService } from '../src/modules/ai-create-task/review-collaboration.service'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { DepartureFinanceGenerationService } from '../src/modules/finance/departure-finance-generation.service'
import { createTestApp } from './helpers'

const AMOUNT_X = 1_000_000
const AMOUNT_Y = 2_000_000
const PREVIEW_WINDOW_MS = 250

type ReceivableConfirmWriter = {
  writeConfirmedSourceOrderReceivables: (
    tx: Prisma.TransactionClient,
    organizationId: string,
    pkg: Pick<AiReviewPackage, 'baselineSnapshot' | 'candidates'>,
  ) => Promise<{ generation: string; scheduleIds: string[] }>
}

/**
 * Symptom loop for review-confirm TOCTOU:
 * previewInitialReceivables reads source_orders without FOR UPDATE, then
 * generateReceivableSchedulesInTx locks and creates from the locked row.
 * Under READ COMMITTED a concurrent convention save can land in that gap.
 */
describe('Source-order receivable confirm convention TOCTOU (integration)', () => {
  let app: INestApplication
  let prisma: PrismaClient
  let writerClient: PrismaClient
  let organizationId: string
  let ownerUserId: string
  let partnerId: string
  const testPrefix = `e2e-so-ar-toctou-${Date.now()}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(PrismaService)
    writerClient = new PrismaClient()
    const user = await prisma.user.findFirstOrThrow({
      where: { username: 'wangjie', deletedAt: null },
    })
    organizationId = user.organizationId
    ownerUserId = user.id
    const partner = await prisma.partner.create({
      data: {
        organizationId,
        name: `${testPrefix}-partner`,
        partnerKind: PartnerKind.group_agent,
        partnerType: PartnerType.group_agency,
        status: DirectoryProfileStatus.active,
      },
    })
    partnerId = partner.id
  })

  afterAll(async () => {
    await prisma.paymentSchedule.deleteMany({
      where: {
        organizationId,
        departure: { name: { startsWith: testPrefix } },
      },
    })
    await prisma.sourceOrder.deleteMany({
      where: { departure: { organizationId, name: { startsWith: testPrefix } } },
    })
    await prisma.partner.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await prisma.departure.deleteMany({
      where: { organizationId, name: { startsWith: testPrefix } },
    })
    await writerClient.$disconnect()
    await app.close()
  })

  it('must not persist convention-Y receivables when confirm races a live convention save', async () => {
    const departure = await prisma.departure.create({
      data: {
        organizationId,
        departureNo: `${testPrefix}-DEP`,
        name: `${testPrefix}-发团`,
        routeName: 'TOCTOU 路线',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-05T00:00:00.000Z'),
        dayCount: 5,
        ownerUserId,
      },
    })
    const sourceOrder = await prisma.sourceOrder.create({
      data: {
        departureId: departure.id,
        partnerId,
        displayName: `${testPrefix}-客源`,
        guestCount: 10,
        adultGuestCount: 10,
        childGuestCount: 0,
        adultUnitPriceCents: 100_000,
        childUnitPriceCents: 0,
        grossReceivableCents: AMOUNT_X,
        netReceivableCents: AMOUNT_X,
        collectionMode: SourceOrderCollectionMode.partner_settled,
        depositCents: 0,
        balanceCents: 0,
        partnerCollectedCents: AMOUNT_X,
        guestCollectCents: 0,
      },
    })

    const reviews = app.get(ReviewCollaborationService, { strict: false })
    const generation = app.get(DepartureFinanceGenerationService)
    const originalPreview = generation.previewInitialReceivables.bind(generation)
    let previewed!: () => void
    const previewedAt = new Promise<void>((resolve) => {
      previewed = resolve
    })
    generation.previewInitialReceivables = (async (
      ...args: Parameters<DepartureFinanceGenerationService['previewInitialReceivables']>
    ) => {
      const preview = await originalPreview(...args)
      previewed()
      await new Promise((resolve) => setTimeout(resolve, PREVIEW_WINDOW_MS))
      return preview
    }) as DepartureFinanceGenerationService['previewInitialReceivables']

    const pkg = {
      baselineSnapshot: {
        sourceOrderId: sourceOrder.id,
        collectionMode: SourceOrderCollectionMode.partner_settled,
        depositCents: 0,
        balanceCents: 0,
        netReceivableCents: AMOUNT_X,
        partnerId,
      },
      candidates: [
        {
          fieldKey: 'historyStatus',
          proposedValue: 'ready',
        },
      ],
    }

    try {
      const writeConfirmed = (
        reviews as unknown as ReceivableConfirmWriter
      ).writeConfirmedSourceOrderReceivables.bind(reviews)

      const confirm = prisma.$transaction(
        async (tx) => writeConfirmed(tx, organizationId, pkg as Pick<AiReviewPackage, 'baselineSnapshot' | 'candidates'>),
        { maxWait: 15_000, timeout: 15_000 },
      )

      const racedSave = previewedAt.then(() =>
        writerClient.sourceOrder.update({
          where: { id: sourceOrder.id },
          data: {
            adultUnitPriceCents: 200_000,
            grossReceivableCents: AMOUNT_Y,
            netReceivableCents: AMOUNT_Y,
            partnerCollectedCents: AMOUNT_Y,
          },
        }),
      )

      const settled = await Promise.allSettled([confirm, racedSave])
      const confirmOutcome = settled[0]

      const schedules = await prisma.paymentSchedule.findMany({
        where: {
          organizationId,
          sourceId: sourceOrder.id,
          sourceType: PaymentScheduleSourceType.SOURCE_ORDER_CUSTOMER_SETTLEMENT,
          cancelledAt: null,
          voidedAt: null,
        },
        select: { amountCents: true, id: true },
      })
      const amounts = schedules.map((row) => row.amountCents)

      expect(amounts).not.toContain(AMOUNT_Y)
      if (confirmOutcome.status === 'fulfilled') {
        expect(amounts).toEqual([AMOUNT_X])
      } else {
        expect(confirmOutcome.reason).toBeInstanceOf(ConflictException)
        expect(amounts).toEqual([])
      }
    } finally {
      generation.previewInitialReceivables = originalPreview
    }
  })
})
