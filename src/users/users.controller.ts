import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
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
import { Model } from 'mongoose';
import { TravelRoom, TravelRoomDocument } from '../schemas/travel-room.schema';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(TravelRoom.name)
    private roomModel: Model<TravelRoomDocument>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: '내 프로필 + 여행 통계' })
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
      ...this.usersService.toPublicUser(doc),
      stats: { ongoingTrips: ongoing, completedTrips: completed },
    };
  }

  @Get('me/travel-type')
  @ApiOperation({ summary: '두리 테스트 결과 (TravelType)' })
  async getTravelType(@CurrentUser() user: AuthUser) {
    const doc = await this.usersService.findById(user.userId);
    return doc?.travelType ?? null;
  }

  @Get('me/trips-summary')
  @ApiOperation({ summary: 'ongoing / completed 여행 수' })
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
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateById(user.userId, dto);
    return this.usersService.toPublicUser(updated!);
  }

  @Patch('me/onboarding-complete')
  @ApiOperation({ summary: '온보딩 완료 처리' })
  async completeOnboarding(@CurrentUser() user: AuthUser) {
    const updated = await this.usersService.updateById(user.userId, {
      onboardingCompleted: true,
    });
    return this.usersService.toPublicUser(updated!);
  }
}
