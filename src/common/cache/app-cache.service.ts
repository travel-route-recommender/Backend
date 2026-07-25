import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type MemoryEntry = { value: unknown; expiresAt: number };

/**
 * L1(메모리) + L2(Redis) 캐시.
 * REDIS_URL 없으면 메모리만 사용. Redis 장애 시에도 메모리로 계속 동작.
 */
@Injectable()
export class AppCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private redis: Redis | null = null;
  private readonly keyPrefix: string;

  constructor(private readonly config: ConfigService) {
    this.keyPrefix = this.config.get<string>('REDIS_KEY_PREFIX', 'tourmate:');
  }

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.log('REDIS_URL 없음 → 메모리 캐시만 사용');
      return;
    }

    try {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
      });
      await this.redis.ping();
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis error: ${err.message}`);
      });
      this.logger.log('Redis 캐시 연결됨');
    } catch (err) {
      this.logger.warn(
        `Redis 연결 실패 → 메모리 캐시로 fallback (${(err as Error).message})`,
      );
      if (this.redis) {
        try {
          this.redis.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = null;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const fullKey = this.prefix(key);

    const mem = this.memory.get(fullKey);
    if (mem) {
      if (Date.now() <= mem.expiresAt) return mem.value as T;
      this.memory.delete(fullKey);
    }

    if (!this.redis) return undefined;

    try {
      const raw = await this.redis.get(fullKey);
      if (raw == null) return undefined;
      const value = JSON.parse(raw) as T;
      const ttl = await this.redis.pttl(fullKey);
      if (ttl > 0) {
        this.memory.set(fullKey, {
          value,
          expiresAt: Date.now() + ttl,
        });
      }
      return value;
    } catch (err) {
      this.logger.warn(`Redis get 실패 (${key}): ${(err as Error).message}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    const fullKey = this.prefix(key);
    const expiresAt = Date.now() + ttlMs;
    this.memory.set(fullKey, { value, expiresAt });

    if (!this.redis) return;

    try {
      await this.redis.set(fullKey, JSON.stringify(value), 'PX', ttlMs);
    } catch (err) {
      this.logger.warn(`Redis set 실패 (${key}): ${(err as Error).message}`);
    }
  }

  /** nearby 등 좌표 캐시 키용. decimals=3 ≈ 100m 단위 */
  static bucketCoord(value: number, decimals = 3): number {
    const f = 10 ** decimals;
    return Math.round(value * f) / f;
  }

  private prefix(key: string) {
    return `${this.keyPrefix}${key}`;
  }
}
