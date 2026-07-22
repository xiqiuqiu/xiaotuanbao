import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StoredObjectModule } from '../stored-object/stored-object.module'
import { BookingNoticeTemplateController } from './booking-notice-template.controller'
import { BookingNoticeTemplateService } from './booking-notice-template.service'
import { ProductExportService } from './product-export.service'
import { ProductImportController } from './product-import.controller'
import { ProductImportService } from './product-import.service'
import { ProductController } from './product.controller'
import { ProductService } from './product.service'

@Module({
  imports: [AuthModule, StoredObjectModule],
  controllers: [
    ProductImportController,
    BookingNoticeTemplateController,
    ProductController,
  ],
  providers: [
    ProductService,
    ProductImportService,
    BookingNoticeTemplateService,
    ProductExportService,
  ],
  exports: [ProductService, ProductImportService, BookingNoticeTemplateService],
})
export class ProductModule {}
