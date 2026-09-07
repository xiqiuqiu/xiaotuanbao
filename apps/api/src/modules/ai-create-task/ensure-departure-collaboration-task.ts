import {
  AgentTaskStatus,
  AgentTaskType,
  type Prisma,
} from '@prisma/client'

export async function ensureDepartureCollaborationTaskInTx(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string
    userId: string
    departureId: string
    conversationId: string
  },
): Promise<{ id: string; status: AgentTaskStatus; departureId: string }> {
  const existing = await tx.agentTask.findFirst({
    where: {
      organizationId: params.organizationId,
      ownerUserId: params.userId,
      type: AgentTaskType.departure_collaboration,
      departureId: params.departureId,
      status: { in: [AgentTaskStatus.active, AgentTaskStatus.waiting] },
      conversationLinks: { some: { conversationId: params.conversationId } },
    },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) {
    return {
      id: existing.id,
      status: existing.status,
      departureId: params.departureId,
    }
  }
  const task = await tx.agentTask.create({
    data: {
      organizationId: params.organizationId,
      ownerUserId: params.userId,
      type: AgentTaskType.departure_collaboration,
      departureId: params.departureId,
      goal: '已有发团协作',
      status: AgentTaskStatus.active,
      conversationLinks: {
        create: {
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          linkedByUserId: params.userId,
          linkReason: 'departure_collaboration',
        },
      },
    },
  })
  await tx.conversationDepartureLink.upsert({
    where: {
      conversationId_departureId: {
        conversationId: params.conversationId,
        departureId: params.departureId,
      },
    },
    create: {
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      departureId: params.departureId,
      linkedByUserId: params.userId,
    },
    update: {},
  })
  return {
    id: task.id,
    status: task.status,
    departureId: params.departureId,
  }
}
