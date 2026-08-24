import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

/**
 * Notification delivery is not wired yet (push/email/in-app channel TBD).
 * Contract stub so FE can poll without 404.
 */
@ApiTags('알림 (stub)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  @Get()
  @ApiOperation({
    summary: '내 알림 목록 (stub)',
    description: '채널 미정. 현재는 항상 빈 목록 + available:false',
  })
  @ApiOkResponse({ description: 'stub empty inbox' })
  list(@CurrentUser() _user: AuthUser) {
    return {
      available: false,
      reason: 'NOTIFICATION_CHANNEL_NOT_CONFIGURED',
      items: [],
      unreadCount: 0,
    };
  }

  @Post('ack')
  @ApiOperation({
    summary: '알림 읽음 처리 (stub)',
    description: '실제 저장 없음. 계약 유지용.',
  })
  ack(
    @CurrentUser() _user: AuthUser,
    @Body() body: { notificationIds?: string[] },
  ) {
    return {
      available: false,
      acknowledged: body.notificationIds ?? [],
    };
  }
}
