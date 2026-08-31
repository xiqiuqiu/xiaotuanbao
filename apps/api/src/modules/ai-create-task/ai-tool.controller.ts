import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common'
import type { GetTaskContextOutput } from '@xiaotuanbao/ai-contracts'
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator'
import { AgentServiceIdentityGuard } from './agent-service-identity.guard'
import { AiToolHttpAdapter } from './ai-tool-http.adapter'
import {
  AiOperationDelegationGuard,
  type AiToolRequestUser,
} from './ai-operation-delegation.guard'

@Controller('ai-tools')
@SkipCsrf()
@UseGuards(AgentServiceIdentityGuard, AiOperationDelegationGuard)
export class AiToolController {
  constructor(private readonly aiToolHttpAdapter: AiToolHttpAdapter) {}

  @Post('v1/get-task-context')
  @HttpCode(200)
  getTaskContext(
    @Req() request: { user: AiToolRequestUser },
    // 工具入参由 ai-contracts Zod `.strip()` 校验。全局 ValidationPipe forbidNonWhitelisted
    // 会把契约允许丢弃的多余字段打成 400，因此这里不用 class-validator DTO。
    @Body() body: unknown,
  ): Promise<GetTaskContextOutput> {
    return this.aiToolHttpAdapter.getTaskContext(request.user, body)
  }

  @Post('v1/propose-review-package')
  @HttpCode(200)
  proposeReviewPackage(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.proposeReviewPackage(request.user, body)
  }

  @Post('v1/submit-review-package')
  @HttpCode(200)
  submitReviewPackage(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.submitReviewPackage(request.user, body)
  }

  @Post('v1/search-route-templates')
  @HttpCode(200)
  searchRouteTemplates(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.searchRouteTemplates(request.user, body)
  }

  @Post('v1/search-users')
  @HttpCode(200)
  searchUsers(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.searchUsers(request.user, body)
  }

  @Post('v1/search-suppliers')
  @HttpCode(200)
  searchSuppliers(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.searchSuppliers(request.user, body)
  }

  @Post('v1/search-partners')
  @HttpCode(200)
  searchPartners(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.searchPartners(request.user, body)
  }

  @Post('v1/get-material-parse-result')
  @HttpCode(200)
  getMaterialParseResult(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.getMaterialParseResult(request.user, body)
  }

  @Post('v1/read-conversation-history')
  @HttpCode(200)
  readConversationHistory(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.readConversationHistory(request.user, body)
  }

  @Post('v1/read-conversation-source')
  @HttpCode(200)
  readConversationSource(
    @Req() request: { user: AiToolRequestUser },
    @Body() body: unknown,
  ) {
    return this.aiToolHttpAdapter.readConversationSource(request.user, body)
  }
}
