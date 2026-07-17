import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PlatformController } from './platform.controller'
import { PlatformOrganizationsService } from './platform-organizations.service'

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformOrganizationsService],
})
export class PlatformModule {}
