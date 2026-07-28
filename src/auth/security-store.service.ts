import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

interface MemoryValue {
  value: string;
  expiresAt: number;
}

export interface SecurityStoreHealth {
  ready: boolean;
  backend: 'redis' | 'memory';
}

@Injectable()
export class SecurityStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityStoreService.name);
  private readonly memoryValues = new Map<string, MemoryValue>();
  private readonly memoryWindows = new Map<string, number[]>();
  private redis?: Redis;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;

    const redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    try {
      await redis.connect();
      this.redis = redis;
    } catch (error) {
      redis.disconnect();
      if (this.config.get('NODE_ENV') === 'production') throw error;
      this.logger.warn(
        'Redis is unavailable; using process-local security counters outside production',
      );
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  async health(): Promise<SecurityStoreHealth> {
    if (!this.redis) {
      return {
        ready: this.config.get('NODE_ENV') !== 'production',
        backend: 'memory',
      };
    }
    try {
      return {
        ready: (await this.redis.ping()) === 'PONG',
        backend: 'redis',
      };
    } catch {
      return { ready: false, backend: 'redis' };
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) return this.redis.get(key);
    const entry = this.memoryValues.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memoryValues.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
      return;
    }
    this.memoryValues.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1_000,
    });
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (this.redis) {
      await this.redis.del(...keys);
      return;
    }
    keys.forEach((key) => {
      this.memoryValues.delete(key);
      this.memoryWindows.delete(key);
    });
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.redis) {
      const result = await this.redis
        .multi()
        .incr(key)
        .expire(key, ttlSeconds)
        .exec();
      return Number(result?.[0]?.[1] ?? 0);
    }
    const current = Number((await this.get(key)) ?? '0') + 1;
    await this.set(key, String(current), ttlSeconds);
    return current;
  }

  async hitSlidingWindow(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    if (this.redis) {
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local cutoff = now - tonumber(ARGV[2])
        redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
        redis.call('ZADD', key, now, ARGV[3])
        redis.call('EXPIRE', key, math.ceil(tonumber(ARGV[2]) / 1000) + 1)
        return redis.call('ZCARD', key)
      `;
      const count = await this.redis.eval(
        script,
        1,
        key,
        now,
        windowSeconds * 1_000,
        `${now}:${randomUUID()}`,
      );
      return Number(count);
    }

    const cutoff = now - windowSeconds * 1_000;
    const events = (this.memoryWindows.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    events.push(now);
    this.memoryWindows.set(key, events);
    return events.length;
  }
}
