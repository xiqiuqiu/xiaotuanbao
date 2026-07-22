import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FILE_STORE } from './file-store'
import { S3FileStore } from './s3-file-store'
import { StoredObjectController } from './stored-object.controller'
import { StoredObjectService } from './stored-object.service'

@Module({
  imports: [AuthModule],
  controllers: [StoredObjectController],
  providers: [
    StoredObjectService,
    {
      provide: FILE_STORE,
      useClass: S3FileStore,
    },
  ],
  exports: [StoredObjectService, FILE_STORE],
})
export class StoredObjectModule {}
