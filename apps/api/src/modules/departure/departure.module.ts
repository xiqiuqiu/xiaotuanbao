import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DepartureController } from './departure.controller'
import { DepartureService } from './departure.service'

@Module({
  imports: [AuthModule],
  controllers: [DepartureController],
  providers: [DepartureService],
})
export class DepartureModule {}
