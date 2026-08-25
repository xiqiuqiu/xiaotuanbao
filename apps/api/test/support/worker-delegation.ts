import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  AiAgentAttemptStatus,
  AiConversationEventKind,
  AiCreateActivityRunStatus,
  AiInputBatchStatus,
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  PrismaClient,
} from '@prisma/client'
import {
  AI_OP_DELEGATION_JWT_AUD,
  AI_OP_DELEGATION_JWT_TYP,
} from '../../src/common/jwt-claims'
import type { AiOperationDelegationPayload } from '../../src/common/types/api-response.type'
import {
  AI_CREATE_AGENT_DEFINITION_REF,
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
} from '@xiaotuanbao/ai-contracts'
import {
  PLAINTEXT_CONTEXT_BUILDER_VERSION,
  PLAINTEXT_SYSTEM_PROMPT_VERSION,
  PLAINTEXT_TOOL_SCHEMA_VERSION,
} from '../../src/modules/ai-create-task/ai-conversation.constants'

export async function mintRunningAttemptDelegation(options: {
  app: INestApplication
  prisma: PrismaClient
  organizationId: string
  userId: string
  taskId: string
  conversationId: string
}): Promise<{
  runId: string
  attemptId: string
  inputBatchId: string
  conversationId: string
  delegationToken: string
}> {
  const { app, prisma, organizationId, userId, taskId, conversationId } = options
  const last = await prisma.aiConversationEvent.findFirst({
    where: { conversationId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })
  const sequence = (last?.sequence ?? 0) + 1
  const event = await prisma.aiConversationEvent.create({
    data: {
      organizationId,
      conversationId,
      sequence,
      kind: AiConversationEventKind.user_message,
      payload: { text: 'e2e worker-shaped attempt' },
    },
  })
  const batch = await prisma.aiInputBatch.create({
    data: {
      organizationId,
      conversationId,
      creatorUserId: userId,
      userMessageEventId: event.id,
      conversationVersion: 1,
      status: AiInputBatchStatus.agent_running,
      taskLinks: {
        create: { organizationId, taskId, role: 'primary' },
      },
    },
  })
  const job = await prisma.aiWorkflowJob.create({
    data: {
      organizationId,
      taskId,
      conversationId,
      inputBatchId: batch.id,
      type: AiWorkflowJobType.agent_batch,
      jobKey: `e2e-attempt:${randomUUID()}`,
      status: AiWorkflowJobStatus.succeeded,
    },
  })
  const run = await prisma.aiCreateActivityRun.create({
    data: {
      organizationId,
      taskId,
      creatorUserId: userId,
      status: AiCreateActivityRunStatus.running,
    },
  })
  const manifest = await prisma.aiContextManifest.create({
    data: {
      organizationId,
      taskId,
      conversationId,
      inputBatchId: batch.id,
      conversationVersion: 1,
      eventSequences: [sequence],
      businessSnapshotVersion: 1,
      builderVersion: PLAINTEXT_CONTEXT_BUILDER_VERSION,
      systemPromptVersion: PLAINTEXT_SYSTEM_PROMPT_VERSION,
      toolSchemaVersion: PLAINTEXT_TOOL_SCHEMA_VERSION,
      modelId: 'e2e',
      inputHash: `e2e-${batch.id}`,
      truncationReasons: [],
    },
  })
  const attempt = await prisma.aiAgentAttempt.create({
    data: {
      organizationId,
      taskId,
      conversationId,
      inputBatchId: batch.id,
      jobId: job.id,
      activityRunId: run.id,
      contextManifestId: manifest.id,
      agentDefinitionKey: AI_CREATE_AGENT_DEFINITION_REF.key,
      agentDefinitionVersion: AI_CREATE_AGENT_DEFINITION_REF.version,
      grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
      status: AiAgentAttemptStatus.running,
    },
  })
  const jwt = app.get(JwtService)
  const config = app.get(ConfigService)
  const payload: AiOperationDelegationPayload = {
    typ: AI_OP_DELEGATION_JWT_TYP,
    sub: userId,
    organizationId,
    taskId,
    runId: run.id,
    conversationId,
    inputBatchId: batch.id,
    attemptId: attempt.id,
    contextManifestId: manifest.id,
    agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
    grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
    entitlementStatus: 'unavailable',
    objectScopes: [{ organizationId, kind: 'ai_create_task', id: taskId }],
  }
  const delegationToken = await jwt.signAsync(payload, {
    expiresIn: 600,
    secret: config.getOrThrow<string>('app.jwtDelegationSecret'),
    audience: AI_OP_DELEGATION_JWT_AUD,
  })
  return {
    runId: run.id,
    attemptId: attempt.id,
    inputBatchId: batch.id,
    conversationId,
    delegationToken,
  }
}
