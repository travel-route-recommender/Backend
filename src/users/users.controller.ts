import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import {
  MeResponseDto,
  PublicUserDto,
  TravelTypeDto,
  TripsSummaryDto,
  UserListPageDto,
} from '../common/dto/swagger-responses.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { AccountDeletionService } from './account-deletion.service';

@ApiTags('유저')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountDeletionService: AccountDeletionService,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
  ) {}

  @Get()
  @ApiOperation({
    summary: '회원가입한 유저 목록',
    description:
      '현재 사용자와 공유 여행방에 참여 중인 PublicUser 목록. 이메일·인증 정보는 제외합니다. 기본은 게스트 제외.',
  })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: '50',
    description: '최대 100',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    example: '윤지',
    description: 'nickname 부분 검색',
  })
  @ApiQuery({
    name: 'includeGuests',
    required: false,
    example: 'false',
    description: 'true면 게스트 초대 유저 포함',
  })
  @ApiOkResponse({ type: UserListPageDto })
  async listUsers(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('includeGuests') includeGuests?: string,
  ) {
    const viewerId = new Types.ObjectId(user.userId);
    const sharedUserIds = await this.roomModel
      .distinct('members.userId', { 'members.userId': viewerId })
      .exec();

    return this.usersService.listUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      q,
      includeGuests: includeGuests === 'true' || includeGuests === '1',
      allowedUserIds: [...sharedUserIds, viewerId],
    });
  }

  @Get('me')
  @ApiOperation({
    summary: '내 전체 프로필 + 여행 통계',
    description:
      '온보딩·퀴즈·성향 축 등 본인 필드 전부 + stats. passwordHash/refreshTokens는 제외.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  async getMe(@CurrentUser() user: AuthUser) {
    const doc = await this.usersService.findById(user.userId);
    if (!doc) return null;

    const ongoing = await this.roomModel.countDocuments({
      'members.userId': doc._id,
      status: 'ongoing',
    });
    const completed = await this.roomModel.countDocuments({
      'members.userId': doc._id,
      status: 'completed',
    });

    return {
      ...this.usersService.toFullUser(doc),
      stats: { ongoingTrips: ongoing, completedTrips: completed },
    };
  }

  @Get('me/travel-type')
  @ApiOperation({ summary: '두리 테스트 결과 (TravelType)' })
  @ApiOkResponse({ type: TravelTypeDto })
  async getTravelType(@CurrentUser() user: AuthUser) {
    const doc = await this.usersService.findById(user.userId);
    return doc?.travelType ?? null;
  }

  @Get('me/trips-summary')
  @ApiOperation({ summary: 'ongoing / completed 여행 수' })
  @ApiOkResponse({ type: TripsSummaryDto })
  async getTripsSummary(@CurrentUser() user: AuthUser) {
    const doc = await this.usersService.findById(user.userId);
    if (!doc) return { ongoing: 0, completed: 0 };

    const ongoing = await this.roomModel.countDocuments({
      'members.userId': doc._id,
      status: 'ongoing',
    });
    const completed = await this.roomModel.countDocuments({
      'members.userId': doc._id,
      status: 'completed',
    });
    return { ongoing, completed };
  }

  @Patch('me/profile')
  @ApiOperation({ summary: '프로필 수정' })
  @ApiOkResponse({ type: PublicUserDto })
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateById(user.userId, dto);
    return this.usersService.toPublicUser(updated!);
  }

  @Patch('me/onboarding-complete')
  @ApiOperation({ summary: '온보딩 완료 처리' })
  @ApiOkResponse({ type: PublicUserDto })
  async completeOnboarding(@CurrentUser() user: AuthUser) {
    const updated = await this.usersService.updateById(user.userId, {
      onboardingCompleted: true,
    });
    return this.usersService.toPublicUser(updated!);
  }

  @Delete('me')
  @ApiOperation({
    summary: '내 계정과 연결된 개인정보 영구 삭제',
    description:
      '이메일 계정은 현재 비밀번호가 필요합니다. 탈퇴자가 만든 여행방은 삭제하고, 다른 사람의 공유 여행방에서는 탈퇴자의 개인 참조·기여 항목·업로드 파일을 삭제합니다.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
  })
  deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.accountDeletionService.deleteAccount(user.userId, dto.password);
  }
}
