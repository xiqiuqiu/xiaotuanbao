import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { OrganizationStatus, UserStatus, AiAgentAttemptStatus, AiCreateActivityRunStatus } from '@prisma/client'
import { requestContextSchema } from '@xiaotuanbao/ai-contracts'
import {
  AI_OP_DELEGATION_JWT_AUD,
  AI_OP_DELEGATION_JWT_TYP,
} from '../../common/jwt-claims'
import type { AiOperationDelegationPayload } from '../../common/types/api-response.type'
import { PrismaService } from '../../database/prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { AiCollaborationHttpException } from './ai-collaboration.http-exception'
import { isAiCreateAssistEnabledForUser } from './ai-create-assist-access'

export type AiToolRequestUser = {
  userId: string
  organizationId: string
  taskId: string
  runId: string
  conversationId: string
  inputBatchId: string
  attemptId?: string
  contextManifestId?: string
  agentDefinition: { key: string; version: number }
  grantedCapabilities: Array<{ key: string; version: number }>
  entitlementStatus: 'available' | 'unavailable'
  objectScopes: Array<{ organizationId: string; kind: string; id: string }>
}

@Injectable()
export class AiOperationDelegationGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AiToolRequestUser }>()
    const header = request.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    let payload: AiOperationDelegationPayload
    try {
      payload = await this.jwtService.verifyAsync<AiOperationDelegationPayload>(token, {
        secret: this.configService.getOrThrow<string>('app.jwtDelegationSecret'),
        audience: AI_OP_DELEGATION_JWT_AUD,
      })
    } catch {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    if (
      payload.typ !== AI_OP_DELEGATION_JWT_TYP ||
      !payload.sub ||
      !payload.organizationId ||
      !payload.taskId ||
      !payload.runId ||
      !payload.conversationId ||
      !payload.inputBatchId ||
      !payload.attemptId
    ) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const trustedContext = requestContextSchema.safeParse({
      organizationId: payload.organizationId,
      userId: payload.sub,
      taskId: payload.taskId,
      runId: payload.runId,
      conversationId: payload.conversationId,
      inputBatchId: payload.inputBatchId,
      attemptId: payload.attemptId,
      contextManifestId: payload.contextManifestId,
      agentDefinition: payload.agentDefinition,
      grantedCapabilities: payload.grantedCapabilities,
      entitlementStatus: payload.entitlementStatus,
      objectScopes: payload.objectScopes,
    })
    if (!trustedContext.success) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        organizationId: payload.organizationId,
        status: UserStatus.enabled,
        deletedAt: null,
        organization: { deletedAt: null, status: OrganizationStatus.enabled },
      },
      select: { id: true, organizationId: true },
    })
    if (!user) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    const permissionKeys = await this.authService.getPermissionKeysForUser(user.id)
    if (!permissionKeys.includes('departure:write')) {
      throw AiCollaborationHttpException.fromCode('PERMISSION_DENIED')
    }

    if (!isAiCreateAssistEnabledForUser(this.configService, user.id)) {
      throw AiCollaborationHttpException.fromCode('PERMISSION_DENIED')
    }

    const attempt = await this.prisma.aiAgentAttempt.findFirst({
      where: {
        id: payload.attemptId,
        status: AiAgentAttemptStatus.running,
        organizationId: payload.organizationId,
        taskId: payload.taskId,
        conversationId: payload.conversationId,
        inputBatchId: payload.inputBatchId,
        activityRunId: payload.runId,
        activityRun: { status: AiCreateActivityRunStatus.running },
      },
      select: {
        id: true,
        agentDefinitionKey: true,
        agentDefinitionVersion: true,
        grantedCapabilities: true,
      },
    })
    if (
      !attempt ||
      attempt.agentDefinitionKey !== trustedContext.data.agentDefinition.key ||
      attempt.agentDefinitionVersion !== trustedContext.data.agentDefinition.version ||
      JSON.stringify(attempt.grantedCapabilities) !==
        JSON.stringify(trustedContext.data.grantedCapabilities)
    ) {
      throw AiCollaborationHttpException.fromCode('DELEGATION_INVALID')
    }

    request.user = {
      userId: user.id,
      organizationId: user.organizationId,
      taskId: payload.taskId,
      runId: payload.runId,
      conversationId: payload.conversationId,
      inputBatchId: payload.inputBatchId,
      attemptId: payload.attemptId,
      contextManifestId: payload.contextManifestId,
      agentDefinition: trustedContext.data.agentDefinition,
      grantedCapabilities: trustedContext.data.grantedCapabilities,
      entitlementStatus: trustedContext.data.entitlementStatus,
      objectScopes: trustedContext.data.objectScopes,
    }
    return true
  }
}
