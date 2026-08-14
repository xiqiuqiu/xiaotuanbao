import type { Prisma } from '@prisma/client'

const TASK_LOCK_OPERATION = 'ai-create-task'
const SEND_LOCK_OPERATION = 'ai-create-send'

export async function lockAiCreateTask(
  tx: Prisma.TransactionClient,
  organizationId: string,
  taskId: string,
): Promise<void> {
  const lockScope = `${organizationId}|${TASK_LOCK_OPERATION}|${taskId}`
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))::text AS lock
  `
  await tx.$queryRaw`
    SELECT id
    FROM ai_create_tasks
    WHERE id = ${taskId}
      AND organization_id = ${organizationId}
    FOR UPDATE
  `
}

export async function lockAiCreateSender(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const lockScope = `${organizationId}|${SEND_LOCK_OPERATION}|${userId}`
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))::text AS lock
  `
}
