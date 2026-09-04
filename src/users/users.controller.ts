import {
  Body,
  Controller,
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
import { Public } from '../common/decorators/public.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';
import {
  MeResponseDto,
  PublicUserDto,
  TravelTypeDto,
  TripsSummaryDto,
  UserListPageDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('유저')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '회원가입한 유저 목록 (인증 불필요)',
    description:
      '전체 회원 PublicUser 목록. Bearer 없이 호출 가능. passwordHash/refreshTokens 제외. 기본은 게스트 제외.',
  })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '50', description: '최대 100' })
  @ApiQuery({
    name: 'q',
    required: false,
    example: '윤지',
    description: 'nickname / email 부분 검색',
  })
  @ApiQuery({
    name: 'includeGuests',
    required: false,
    example: 'false',
    description: 'true면 게스트 초대 유저 포함',
  })
  @ApiOkResponse({ type: UserListPageDto })
  listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('includeGuests') includeGuests?: string,
  ) {
    return this.usersService.listUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      q,
      includeGuests: includeGuests === 'true' || includeGuests === '1',
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
}
