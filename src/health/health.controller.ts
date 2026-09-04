import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection, ConnectionStates } from 'mongoose';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    if (
      this.connection.readyState !== ConnectionStates.connected ||
      !this.connection.db
    ) {
      throw new ServiceUnavailableException('Database is not ready');
    }

    try {
      await this.connection.db.command({ ping: 1 }, { timeoutMS: 2_000 });
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }
}
