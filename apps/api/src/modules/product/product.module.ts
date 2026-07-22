import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StoredObjectModule } from '../stored-object/stored-object.module'
import { ProductImportController } from './product-import.controller'
import { ProductImportService } from './product-import.service'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'

@Module({
  imports: [AuthModule, StoredObjectModule],
  controllers: [ProductImportController, ProductController],
  providers: [ProductService, ProductImportService],
  exports: [ProductService, ProductImportService],
})
export class ProductModule {}
