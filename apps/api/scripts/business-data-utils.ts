import { DocumentSequenceType, type PrismaClient } from '@prisma/client'

export const FINANCE_SEQUENCE_TYPES: DocumentSequenceType[] = [
  DocumentSequenceType.departure,
  DocumentSequenceType.ar,
  DocumentSequenceType.ap,
  DocumentSequenceType.tx,
  DocumentSequenceType.cl,
]

export async function clearBusinessData(prisma: PrismaClient) {
  return prisma.$transaction(async (tx) => {
    const verifications = await tx.financeVerification.deleteMany()
    const settlementHistories = await tx.departureSettlementHistory.deleteMany()
    const schedules = await tx.paymentSchedule.deleteMany()
    const transactions = await tx.financeTransaction.deleteMany()
    const departures = await tx.departure.deleteMany()
    const routeTemplates = await tx.routeTemplate.deleteMany()
    const sequences = await tx.documentSequence.deleteMany({
      where: { documentType: { in: FINANCE_SEQUENCE_TYPES } },
    })

    return {
      financeVerifications: verifications.count,
      departureSettlementHistories: settlementHistories.count,
      paymentSchedules: schedules.count,
      financeTransactions: transactions.count,
      departures: departures.count,
      routeTemplates: routeTemplates.count,
      documentSequences: sequences.count,
    }
  })
}

export async function countBusinessData(prisma: PrismaClient) {
  return {
    departures: await prisma.departure.count(),
    sourceOrders: await prisma.sourceOrder.count(),
    paymentSchedules: await prisma.paymentSchedule.count(),
    financeTransactions: await prisma.financeTransaction.count(),
    financeVerifications: await prisma.financeVerification.count(),
    routeTemplates: await prisma.routeTemplate.count(),
    suppliers: await prisma.supplier.count(),
    partners: await prisma.partner.count(),
    documentSequences: await prisma.documentSequence.count(),
  }
}
