import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FinanceModule } from '../finance/finance.module'
import { NumberAllocationModule } from '../number-allocation/number-allocation.module'
import { DepartureController } from './departure.controller'
import { DepartureService } from './departure.service'
import { DepartureReadModelService } from './departure-read-model.service'
import { RouteTemplateController } from './route-template.controller'
import { DepartureCopyService } from './departure-copy.service'
import { RouteTemplateCopyService } from './route-template-copy.service'
import { RouteTemplateService } from './route-template.service'
import { SourceOrderController } from './source-order.controller'
import { SourceOrderService } from './source-order.service'
import { SegmentController } from './segment.controller'
import { SegmentService } from './segment.service'
import { SegmentResourceController } from './segment-resource.controller'
import { SegmentResourceService } from './segment-resource.service'
import { DepartureResourceController } from './departure-resource.controller'
import { DepartureResourceService } from './departure-resource.service'
import { DepartureFinanceReadController } from './departure-finance-read.controller'
import { DepartureOperationsSheetService } from './departure-operations-sheet.service'
import { DepartureOperationsSheetExcelRenderer } from './departure-operations-sheet-excel.types'
import { ExcelJsDepartureOperationsSheetRenderer } from './departure-operations-sheet-exceljs.renderer'
import { DepartureIncomeRecordService } from './departure-income-record.service'
import { DepartureDataGapService } from './departure-data-gap.service'
import { DepartureSettlementReadinessService } from './departure-settlement-readiness.service'
import { SourceOrderReceivableGapService } from './source-order-receivable-gap.service'
import { SegmentResourcePayableGapService } from './segment-resource-payable-gap.service'
import { AccountGenerationGapService } from './account-generation-gap.service'
import { AccountGenerationGapController } from './account-generation-gap.controller'
import { RouteLedgerExportService } from './route-ledger-export.service'

@Module({
  imports: [AuthModule, forwardRef(() => FinanceModule), NumberAllocationModule],
  controllers: [
    DepartureController,
    DepartureFinanceReadController,
    RouteTemplateController,
    SourceOrderController,
    SegmentController,
    SegmentResourceController,
    DepartureResourceController,
    AccountGenerationGapController,
  ],
  providers: [
    DepartureService,
    DepartureDataGapService,
    DepartureSettlementReadinessService,
    SourceOrderReceivableGapService,
    SegmentResourcePayableGapService,
    AccountGenerationGapService,
    DepartureReadModelService,
    RouteTemplateService,
    RouteTemplateCopyService,
    DepartureCopyService,
    SourceOrderService,
    SegmentService,
    SegmentResourceService,
    DepartureResourceService,
    {
      provide: DepartureOperationsSheetExcelRenderer,
      useClass: ExcelJsDepartureOperationsSheetRenderer,
    },
    DepartureOperationsSheetService,
    DepartureIncomeRecordService,
    RouteLedgerExportService,
  ],
  exports: [
    DepartureService,
    DepartureDataGapService,
    DepartureSettlementReadinessService,
    SourceOrderReceivableGapService,
    SegmentResourcePayableGapService,
    AccountGenerationGapService,
  ],
})
export class DepartureModule {}
