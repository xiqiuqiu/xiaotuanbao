import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import type { PartnerReconciliationStatementSnapshot } from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { buildOperationsSheetContentDisposition } from '../departure/departure-operations-sheet-excel.types'
import { ReconciliationStatementQueryDto } from './dto/reconciliation-statement.dto'
import { PartnerReconciliationStatementService } from './partner-reconciliation-statement.service'

/**
 * 《往来账确认单》导出：合作团单 Tab 工具栏为全系统唯一入口。
 * JSON 快照供抽屉预览，xlsx 即时生成 buffer 附件下载，均不存副本。
 */
@Controller('partners')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class PartnerReconciliationStatementController {
  constructor(
    private readonly statementService: PartnerReconciliationStatementService,
  ) {}

  @Get(':partnerId/reconciliation-statement')
  @RequireMenu('/partner')
  getStatement(
    @Req() request: { user: { organizationId: string } },
    @Param('partnerId') partnerId: string,
    @Query() query: ReconciliationStatementQueryDto,
  ): Promise<PartnerReconciliationStatementSnapshot> {
    return this.statementService.buildSnapshot(
      request.user.organizationId,
      partnerId,
      query.periodStart,
      query.periodEnd,
    )
  }

  @Get(':partnerId/reconciliation-statement.xlsx')
  @RequireMenu('/partner')
  async downloadStatement(
    @Req() request: { user: { organizationId: string } },
    @Param('partnerId') partnerId: string,
    @Query() query: ReconciliationStatementQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.statementService.buildWorkbook(
      request.user.organizationId,
      partnerId,
      query.periodStart,
      query.periodEnd,
    )
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', buildOperationsSheetContentDisposition(file.filename))
    res.send(file.buffer)
  }
}
