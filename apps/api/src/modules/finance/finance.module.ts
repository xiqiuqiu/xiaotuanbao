import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NumberAllocationModule } from '../number-allocation/number-allocation.module'
import { DepartureModule } from '../departure/departure.module'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
import { DepartureFinanceGenerationService } from './departure-finance-generation.service'
import { FinanceOperationsService } from './finance-operations.service'
import { FinanceIdempotencyService } from './finance-idempotency.service'
import { FinanceReferenceController } from './finance-reference.controller'
import { PayableController } from './payable.controller'
import { PaymentScheduleCancelController } from './payment-schedule-cancel.controller'
import { PaymentScheduleService } from './payment-schedule.service'
import { ReceivableController } from './receivable.controller'
import { TransactionController } from './transaction.controller'
import { TransactionService } from './transaction.service'
import { VerificationController } from './verification.controller'
import { VerificationService } from './verification.service'

@Module({
  imports: [AuthModule, NumberAllocationModule, forwardRef(() => DepartureModule)],
  controllers: [
    ReceivableController,
    PayableController,
    PaymentScheduleCancelController,
    TransactionController,
    VerificationController,
    FinanceReferenceController,
  ],
  providers: [
    DepartureFinanceGenerationService,
    DepartureFinanceFacade,
    PaymentScheduleService,
    VerificationService,
    TransactionService,
    FinanceOperationsService,
    FinanceIdempotencyService,
  ],
  exports: [
    DepartureFinanceFacade,
    PaymentScheduleService,
    VerificationService,
    TransactionService,
  ],
})
export class FinanceModule {}
