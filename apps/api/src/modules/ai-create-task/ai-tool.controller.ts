import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator'
import { AgentServiceIdentityGuard } from './agent-service-identity.guard'
import { AiCreateTaskService } from './ai-create-task.service'
import {
  AiOperationDelegationGuard,
  type AiToolRequestUser,
} from './ai-operation-delegation.guard'

@Controller('ai-tools')
@SkipCsrf()
@UseGuards(AgentServiceIdentityGuard, AiOperationDelegationGuard)
export class AiToolController {
  constructor(private readonly aiCreateTaskService: AiCreateTaskService) {}

  @Post('v1/get-task-context')
  @HttpCode(200)
  getTaskContext(
    @Req() request: { user: AiToolRequestUser },
    // 工具入参由 ai-contracts Zod `.strip()` 校验。全局 ValidationPipe forbidNonWhitelisted
    // 会把契约允许丢弃的多余字段打成 400，因此这里不用 class-validator DTO。
    @Body() body: unknown,
  ): Promise<GetTaskContextOutput> {
    return this.aiCreateTaskService.getTaskContextForAgent(request.user, body)
  }
}
