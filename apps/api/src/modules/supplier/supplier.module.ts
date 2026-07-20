import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FinanceModule } from '../finance/finance.module'
import { SupplierController } from './supplier.controller'
import { SupplierFinanceReadController } from './supplier-finance-read.controller'
import { SupplierService } from './supplier.service'

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [SupplierController, SupplierFinanceReadController],
  providers: [SupplierService],
})
export class SupplierModule {}
