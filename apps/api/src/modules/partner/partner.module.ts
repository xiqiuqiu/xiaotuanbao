import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FinanceModule } from '../finance/finance.module'
import { PartnerController } from './partner.controller'
import { PartnerFinanceReadController } from './partner-finance-read.controller'
import { PartnerReconciliationStatementController } from './partner-reconciliation-statement.controller'
import { PartnerReconciliationStatementExcelRenderer } from './partner-reconciliation-statement-excel.types'
import { ExcelJsPartnerReconciliationStatementRenderer } from './partner-reconciliation-statement-exceljs.renderer'
import { PartnerReconciliationStatementService } from './partner-reconciliation-statement.service'
import { PartnerService } from './partner.service'

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [
    PartnerController,
    PartnerFinanceReadController,
    PartnerReconciliationStatementController,
  ],
  providers: [
    PartnerService,
    PartnerReconciliationStatementService,
    {
      provide: PartnerReconciliationStatementExcelRenderer,
      useClass: ExcelJsPartnerReconciliationStatementRenderer,
    },
  ],
  exports: [PartnerService],
})
export class PartnerModule {}
