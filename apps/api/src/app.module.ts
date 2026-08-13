import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard'
import appConfig from './config/app.config'
import { AuthModule } from './modules/auth/auth.module'
import { HealthModule } from './modules/health/health.module'
import { NumberAllocationModule } from './modules/number-allocation/number-allocation.module'
import { OrganizationModule } from './modules/organization/organization.module'
import { RoleModule } from './modules/role/role.module'
import { UserModule } from './modules/user/user.module'
import { SupplierModule } from './modules/supplier/supplier.module'
import { PartnerModule } from './modules/partner/partner.module'
import { ProductModule } from './modules/product/product.module'
import { DepartureModule } from './modules/departure/departure.module'
import { AiCreateTaskModule } from './modules/ai-create-task/ai-create-task.module'
import { FinanceModule } from './modules/finance/finance.module'
import { PlatformModule } from './modules/platform/platform.module'
import { PrismaModule } from './database/prisma/prisma.module'
import { StoredObjectModule } from './modules/stored-object/stored-object.module'
import { WorkbenchModule } from './modules/workbench/workbench.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    NumberAllocationModule,
    AuthModule,
    HealthModule,
    RoleModule,
    OrganizationModule,
    UserModule,
    SupplierModule,
    PartnerModule,
    ProductModule,
    DepartureModule,
    AiCreateTaskModule,
    FinanceModule,
    PlatformModule,
    WorkbenchModule,
    StoredObjectModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
  ],
})
export class AppModule {}
