/**
 * 仅开发环境重置 Agent 运行数据。
 *
 * 删除范围：会话、未确认建团任务、批次、作业、Attempt、审核包、Action、来源解析
 * 与未登记为正式附件的会话来源。已确认任务及其草稿随 Departure 保留。
 * 不删除 Departure、客源、财务，以及已由领域命令登记的 DepartureMaterial。
 *
 * 用法：pnpm --filter api db:reset-agent-run-data
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export function assertAgentResetEnvironment(nodeEnv = process.env.NODE_ENV ?? 'development'): void {
  if (nodeEnv === 'production') {
    throw new Error('拒绝在 production 重置 Agent 运行数据')
  }
}

export async function countProtectedBusiness(db: PrismaClient = prisma) {
  return {
    departures: await db.departure.count(),
    sourceOrders: await db.sourceOrder.count(),
    paymentSchedules: await db.paymentSchedule.count(),
    financeTransactions: await db.financeTransaction.count(),
    financeVerifications: await db.financeVerification.count(),
    formalAttachments: await db.departureMaterial.count(),
  }
}

export async function resetAgentRunData(db: PrismaClient = prisma) {
  return db.$transaction(async (tx) => {
    const reviewRecords = await tx.aiReviewRecord.deleteMany()
    const reviewPackages = await tx.aiReviewPackage.deleteMany()
    const repeatObservations = await tx.aiActionRepeatObservation.deleteMany()
    const actions = await tx.aiAction.deleteMany()
    const attempts = await tx.aiAgentAttempt.deleteMany()
    const jobs = await tx.aiWorkflowJob.deleteMany()
    const batchSources = await tx.inputBatchSource.deleteMany()
    const parseRuns = await tx.conversationSourceParseRun.deleteMany()
    const compaction = await tx.aiContextCompactionVersion.deleteMany()
    const sourceIndexes = await tx.aiSourceIndexVersion.deleteMany()
    const manifests = await tx.aiContextManifest.deleteMany()
    const interactions = await tx.aiConversationInteraction.deleteMany()
    const drafts = await tx.aiConversationDraft.deleteMany()
    const events = await tx.aiConversationEvent.deleteMany()
    const batches = await tx.aiInputBatch.deleteMany()
    const inputBatchLinks = await tx.inputBatchTaskLink.deleteMany()
    const conversationLinks = await tx.conversationTaskLink.deleteMany()
    const activities = await tx.taskActivity.deleteMany()
    const idempotency = await tx.aiCreateIdempotencyRecord.deleteMany()
    const activityRuns = await tx.aiCreateActivityRun.deleteMany()
    const unlinkedSources = await tx.conversationSource.deleteMany({
      where: { formalAttachments: { none: {} } },
    })
    const conversations = await tx.aiConversation.deleteMany()
    const unusedCreationTasks = await tx.aiCreateTask.deleteMany({
      where: { departureId: null },
    })
    const orphanTasks = await tx.agentTask.deleteMany({
      where: { departureCreationTask: { is: null } },
    })

    return {
      reviewRecords: reviewRecords.count,
      reviewPackages: reviewPackages.count,
      actions: actions.count + repeatObservations.count,
      attempts: attempts.count,
      jobs: jobs.count,
      batches: batches.count + batchSources.count,
      conversations: conversations.count,
      sources: unlinkedSources.count,
      activityRuns: activityRuns.count,
      manifests: manifests.count + compaction.count + sourceIndexes.count,
      interactions: interactions.count,
      drafts: drafts.count,
      events: events.count,
      parseRuns: parseRuns.count,
      links: inputBatchLinks.count + conversationLinks.count,
      activities: activities.count,
      idempotency: idempotency.count,
      unusedCreationTasks: unusedCreationTasks.count,
      orphanTasks: orphanTasks.count,
    }
  })
}

async function main() {
  assertAgentResetEnvironment()
  const before = await countProtectedBusiness()
  console.log('Protected before:', before)
  const deleted = await resetAgentRunData()
  console.log('Deleted agent run data:', deleted)
  const after = await countProtectedBusiness()
  console.log('Protected after:', after)
  if (
    before.departures !== after.departures ||
    before.sourceOrders !== after.sourceOrders ||
    before.paymentSchedules !== after.paymentSchedules ||
    before.financeTransactions !== after.financeTransactions ||
    before.financeVerifications !== after.financeVerifications ||
    before.formalAttachments !== after.formalAttachments
  ) {
    throw new Error('Agent 数据重置触碰了正式业务表')
  }
  console.log('Done. Formal Departure / SourceOrder / finance / attachments preserved.')
}

if (process.argv[1]?.includes('reset-agent-run-data')) {
  main()
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
