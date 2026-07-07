import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PayableController } from './payable.controller'
import { PaymentScheduleCancelController } from './payment-schedule-cancel.controller'
import { PaymentScheduleService } from './payment-schedule.service'
import { ReceivableController } from './receivable.controller'

@Module({
  imports: [AuthModule],
  controllers: [ReceivableController, PayableController, PaymentScheduleCancelController],
  providers: [PaymentScheduleService],
})
export class FinanceModule {}
