import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RoomsService } from './rooms.service';
import { RoomDto } from '../common/dto/swagger-responses.dto';
import { RateLimit } from '../common/guards/rate-limit.guard';

@ApiTags('초대')
@Controller('invites')
export class InvitesController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get(':code')
  @RateLimit({ group: 'invite-landing', limit: 60, windowMs: 60_000 })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @ApiProduces('text/html')
  @ApiOperation({
    summary: '초대 링크 열기 (비인증)',
    description:
      '메시지 앱에서 누를 수 있는 HTTPS 페이지를 제공하고 설치된 두리 앱의 초대 화면을 엽니다.',
  })
  @ApiParam({ name: 'code', example: 'ABCD1234' })
  open(@Param('code') code: string) {
    return this.roomsService.getInviteLandingPage(code);
  }

  @Get(':code/preview')
  @RateLimit({ group: 'invite-preview', limit: 30, windowMs: 60_000 })
  @ApiOperation({
    summary: '초대 링크 미리보기 (비인증)',
    description:
      '가입/참여 전 읽기 전용 미리보기. 여행지·기간·멤버 수·방장만 노출합니다.',
  })
  @ApiParam({ name: 'code', example: 'ABCD1234' })
  preview(@Param('code') code: string) {
    return this.roomsService.getInvitePreview(code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':code/accept')
  @RateLimit({ group: 'invite-accept', limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: '초대 코드로 여행방 참여 (기존 유저)' })
  @ApiParam({ name: 'code', example: 'ABCD1234' })
  @ApiOkResponse({ type: RoomDto })
  accept(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.roomsService.acceptInvite(code, user.userId);
  }
}
