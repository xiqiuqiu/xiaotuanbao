import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import appConfig from './config/app.config'
import { AuthModule } from './modules/auth/auth.module'
import { HealthModule } from './modules/health/health.module'
import { OrganizationModule } from './modules/organization/organization.module'
import { RoleModule } from './modules/role/role.module'
import { UserModule } from './modules/user/user.module'
import { SupplierModule } from './modules/supplier/supplier.module'
import { PartnerModule } from './modules/partner/partner.module'
import { PrismaModule } from './database/prisma/prisma.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    RoleModule,
    OrganizationModule,
    UserModule,
    SupplierModule,
    PartnerModule,
  ],
})
export class AppModule {}
