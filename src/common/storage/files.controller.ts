import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { SignedUrlService } from './signed-url.service';

@ApiTags('파일 · 서명 다운로드')
@Controller('files')
export class FilesController {
  constructor(private readonly signedUrls: SignedUrlService) {}

  @Public()
  @Get('download')
  @ApiOperation({
    summary: '서명 URL로 파일 다운로드',
    description:
      '토큰에 roomId·path·만료가 포함됨. 멤버가 발급한 링크만 유효. 공개 /uploads 정적 서빙과 별개.',
  })
  @ApiQuery({ name: 'token', required: true })
  async download(
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.signedUrls.openDownloadStream(token);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
      'Content-Length': String(file.size),
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.stream);
  }
}
