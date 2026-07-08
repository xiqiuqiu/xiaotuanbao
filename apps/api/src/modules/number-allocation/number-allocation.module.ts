import { Module } from '@nestjs/common'
import { NumberAllocationService } from './number-allocation.service'

@Module({
  providers: [NumberAllocationService],
  exports: [NumberAllocationService],
})
export class NumberAllocationModule {}
