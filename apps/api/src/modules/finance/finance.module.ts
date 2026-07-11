import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NumberAllocationModule } from '../number-allocation/number-allocation.module'
import { DepartureFinanceFacade } from './departure-finance-facade.service'
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
  imports: [AuthModule, NumberAllocationModule],
  controllers: [
    ReceivableController,
    PayableController,
    PaymentScheduleCancelController,
    TransactionController,
    VerificationController,
    FinanceReferenceController,
  ],
  providers: [
    DepartureFinanceFacade,
    PaymentScheduleService,
    VerificationService,
    TransactionService,
    FinanceOperationsService,
    FinanceIdempotencyService,
  ],
  exports: [DepartureFinanceFacade, PaymentScheduleService, VerificationService],
})
export class FinanceModule {}
