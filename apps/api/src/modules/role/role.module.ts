import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RoleController } from './role.controller'
import { RoleService } from './role.service'

@Module({
  imports: [AuthModule],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
