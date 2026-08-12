import { Global, Module } from '@nestjs/common';
import { LocalUploadService } from './local-upload.service';

@Global()
@Module({
  providers: [LocalUploadService],
  exports: [LocalUploadService],
})
export class StorageModule {}
