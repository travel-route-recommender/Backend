import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { UserSavesService } from './user-saves.service';
import { SavePlaceDto } from './dto/save-place.dto';

@ApiTags('user-saves')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/saves')
export class UserSavesController {
  constructor(private readonly savesService: UserSavesService) {}

  @Get()
  @ApiOperation({ summary: '개인 저장 장소 목록' })
  list(@CurrentUser() user: AuthUser) {
    return this.savesService.listSaves(user.userId);
  }

  @Post()
  @ApiOperation({ summary: '장소 저장 (탐색 Save)' })
  save(@CurrentUser() user: AuthUser, @Body() dto: SavePlaceDto) {
    return this.savesService.savePlace(user.userId, dto.placeId, dto.roomId);
  }

  @Delete(':placeId')
  @ApiOperation({ summary: '저장 해제' })
  @ApiParam({ name: 'placeId', example: '665abc123def456789012345' })
  remove(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.savesService.removeSave(user.userId, placeId);
  }
}
