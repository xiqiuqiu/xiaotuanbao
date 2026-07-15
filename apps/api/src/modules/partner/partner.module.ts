import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FinanceModule } from '../finance/finance.module'
import { PartnerController } from './partner.controller'
import { PartnerFinanceReadController } from './partner-finance-read.controller'
import { PartnerService } from './partner.service'

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [PartnerController, PartnerFinanceReadController],
  providers: [PartnerService],
})
export class PartnerModule {}
