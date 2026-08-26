import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { RoomTodosService } from './room-todos.service';
import {
  CreateRoomTodoDto,
  ResolveAutoTodosDto,
  UpdateRoomTodoDto,
} from './dto/room-todo.dto';

const ROOM_ID = { name: 'roomId', example: '665abc123def456789012345' };

@ApiTags('여행방 · TODO')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms/:roomId/todos')
export class RoomTodosController {
  constructor(private readonly todosService: RoomTodosService) {}

  @Get()
  @ApiOperation({ summary: '공유 TODO 목록' })
  @ApiParam(ROOM_ID)
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'assigneeId', required: false })
  @ApiQuery({ name: 'dueDate', required: false })
  @ApiQuery({
    name: 'archived',
    required: false,
    description: 'true | false | all (기본 false=보관 제외)',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('dueDate') dueDate?: string,
    @Query('archived') archived?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.todosService.list(roomId, user.userId, {
      status,
      assigneeId,
      dueDate,
      archived,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Post()
  @ApiOperation({
    summary: '공유 TODO 생성',
    description:
      'source.dedupeKey가 있으면 원자적 중복 방지. 담당자는 방 멤버만.',
  })
  @ApiParam(ROOM_ID)
  create(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: CreateRoomTodoDto,
  ) {
    return this.todosService.create(roomId, user.userId, dto);
  }

  @Post('resolve-auto')
  @ApiOperation({
    summary: '자동 TODO 원인 해소',
    description: 'userEdited=false인 자동 TODO만 done. 사용자 편집분은 보존',
  })
  @ApiParam(ROOM_ID)
  resolveAuto(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: ResolveAutoTodosDto,
  ) {
    return this.todosService.resolveAuto(roomId, user.userId, dto);
  }

  @Patch(':todoId')
  @ApiOperation({
    summary: '공유 TODO 수정',
    description: 'expectedRevision 필수. 충돌 시 409 + 최신 todo',
  })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'todoId' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('todoId') todoId: string,
    @Body() dto: UpdateRoomTodoDto,
  ) {
    return this.todosService.update(roomId, user.userId, todoId, dto);
  }

  @Delete(':todoId')
  @ApiOperation({
    summary: '공유 TODO 삭제/억제',
    description:
      '수동 TODO는 삭제. 자동 TODO는 archived+suppressed (동일 원인 재생성 방지)',
  })
  @ApiParam(ROOM_ID)
  @ApiParam({ name: 'todoId' })
  @ApiQuery({ name: 'expectedRevision', required: true })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Param('todoId') todoId: string,
    @Query('expectedRevision') expectedRevision: string,
    @Query('clientMutationId') clientMutationId?: string,
  ) {
    return this.todosService.remove(
      roomId,
      user.userId,
      todoId,
      parseInt(expectedRevision, 10),
      clientMutationId,
    );
  }
}
