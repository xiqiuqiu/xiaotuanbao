import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PartnerController } from './partner.controller'
import { PartnerService } from './partner.service'

@Module({
  imports: [AuthModule],
  controllers: [PartnerController],
  providers: [PartnerService],
})
export class PartnerModule {}
