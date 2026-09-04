import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { DOCUMENT_MAX_BYTES } from '../common/storage/local-upload.service';
import { RoomDocumentsService } from './room-documents.service';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SignFileDto {
  @ApiProperty({ example: '/uploads/tickets/665abc/file.jpg' })
  @IsString()
  path: string;
}

class UploadDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

const ROOM_ID = { name: 'roomId', example: '665abc123def456789012345' };

@ApiTags('여행방 · 문서')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId')
export class RoomDocumentsController {
  constructor(private readonly docsService: RoomDocumentsService) {}

  @Get('documents')
  @ApiOperation({ summary: '공유 문서 목록 (서명 다운로드 URL 포함)' })
  @ApiParam(ROOM_ID)
  list(@CurrentUser() user: AuthUser, @Param('roomId') roomId: string) {
    return this.docsService.list(roomId, user.userId);
  }

  @Post('documents')
  @ApiOperation({
    summary: '공유 문서 업로드',
    description: 'jpeg/png/webp/heic/pdf · ≤10MB. 응답에 만료 서명 URL 포함.',
  })
  @ApiParam(ROOM_ID)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        note: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_MAX_BYTES },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.docsService.upload(roomId, user.userId, file, dto.note);
  }

  @Delete('documents/:documentId')
  @ApiOperation({ summary: '공유 문서 삭제 (업로더 또는 방장)' })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'documentId' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.docsService.remove(roomId, user.userId, documentId);
  }

  @Post('files/signed-url')
  @ApiOperation({
    summary: '멤버 전용 서명 다운로드 URL 발급',
    description:
      'tickets/documents 경로만. GET /api/v1/files/download?token=… 로 다운로드.',
  })
  @ApiParam(ROOM_ID)
  sign(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: SignFileDto,
  ) {
    return this.docsService.signPath(roomId, user.userId, dto.path);
  }
}
