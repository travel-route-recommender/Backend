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
import { UserSavesService } from './user-saves.service';
import { SavePlaceDto } from './dto/save-place.dto';
import {
  SavedPlaceItemDto,
  SuccessDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('저장')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/saves')
export class UserSavesController {
  constructor(private readonly savesService: UserSavesService) {}

  @Get()
  @ApiOperation({
    summary: '개인 저장 장소 목록',
    description: '탐색에서 Save한 장소들. `placeId`는 Mongo ObjectId입니다.',
  })
  @ApiOkResponse({ type: SavedPlaceItemDto, isArray: true })
  list(@CurrentUser() user: AuthUser) {
    return this.savesService.listSaves(user.userId);
  }

  @Post()
  @ApiOperation({
    summary: '장소 저장',
    description:
      'Mongo `placeId` 필요. TourAPI 장소를 저장하려면 먼저 `/tour/places/{contentId}`로 상세를 열어 `placeId`를 받으세요.',
  })
  save(@CurrentUser() user: AuthUser, @Body() dto: SavePlaceDto) {
    return this.savesService.savePlace(user.userId, dto.placeId, dto.roomId);
  }

  @Delete(':placeId')
  @ApiOperation({ summary: '저장 해제' })
  @ApiParam({ name: 'placeId', example: '665abc123def456789012345' })
  @ApiOkResponse({ type: SuccessDto })
  remove(@CurrentUser() user: AuthUser, @Param('placeId') placeId: string) {
    return this.savesService.removeSave(user.userId, placeId);
  }
}
