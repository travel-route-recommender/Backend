import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ScopesGuard } from '../common/guards/scopes.guard';
import { RoomsController } from './rooms.controller';

describe('RoomsController authorization wiring', () => {
  it('runs JwtAuthGuard before ScopesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RoomsController) ?? [];

    expect(guards).toEqual([JwtAuthGuard, ScopesGuard]);
  });
});
