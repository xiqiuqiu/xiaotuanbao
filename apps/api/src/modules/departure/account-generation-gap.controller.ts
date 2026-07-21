import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import type { AccountGenerationGapListResult } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AccountGenerationGapService } from './account-generation-gap.service'
import { ListAccountGenerationGapsQueryDto } from './dto/account-generation-gap.dto'

@Controller()
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AccountGenerationGapController {
  constructor(
    private readonly accountGenerationGapService: AccountGenerationGapService,
  ) {}

  @Get('account-generation-gaps')
  @RequireMenu('/departure')
  list(
    @Req() request: { user: { organizationId: string } },
    @Query() query: ListAccountGenerationGapsQueryDto,
  ): Promise<AccountGenerationGapListResult> {
    return this.accountGenerationGapService.listPending(
      request.user.organizationId,
      query.page,
      query.pageSize,
    )
  }
}
