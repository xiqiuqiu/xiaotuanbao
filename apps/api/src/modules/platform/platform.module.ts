import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PlatformController } from './platform.controller'

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
})
export class PlatformModule {}
