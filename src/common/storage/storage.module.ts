import { Global, Module } from '@nestjs/common';
import { LocalUploadService } from './local-upload.service';
import { SignedUrlService } from './signed-url.service';
import { FilesController } from './files.controller';

@Global()
@Module({
  providers: [LocalUploadService, SignedUrlService],
  controllers: [FilesController],
  exports: [LocalUploadService, SignedUrlService],
})
export class StorageModule {}
