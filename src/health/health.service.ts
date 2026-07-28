import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { SecurityStoreService } from '../auth/security-store.service';

export interface ReadinessChecks {
  mongodb: 'up' | 'down';
  securityStore: 'redis' | 'memory' | 'down';
}

export interface ReadinessResponse {
  status: 'ok';
  checks: ReadinessChecks;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly securityStore: SecurityStoreService,
  ) {}

  live() {
    return { status: 'ok' as const };
  }

  async ready(): Promise<ReadinessResponse> {
    const checks: ReadinessChecks = {
      mongodb: (await this.mongoReady()) ? 'up' : 'down',
      securityStore: 'down',
    };
    const securityStore = await this.securityStore.health();
    checks.securityStore = securityStore.ready ? securityStore.backend : 'down';

    if (checks.mongodb === 'down' || checks.securityStore === 'down') {
      throw new ServiceUnavailableException({ status: 'error', checks });
    }
    return { status: 'ok' as const, checks };
  }

  private async mongoReady(): Promise<boolean> {
    if (
      this.connection.readyState !== ConnectionStates.connected ||
      !this.connection.db
    ) {
      return false;
    }
    try {
      const result = await this.connection.db.admin().ping();
      return result.ok === 1;
    } catch {
      return false;
    }
  }
}
