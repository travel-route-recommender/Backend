import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RoomsService } from './rooms.service';
import { RoomDto } from '../common/dto/swagger-responses.dto';

@ApiTags('초대')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('invites')
export class InvitesController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post(':code/accept')
  @ApiOperation({ summary: '초대 코드로 여행방 참여 (기존 유저)' })
  @ApiParam({ name: 'code', example: 'ABCD1234' })
  @ApiOkResponse({ type: RoomDto })
  accept(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.roomsService.acceptInvite(code, user.userId);
  }
}
