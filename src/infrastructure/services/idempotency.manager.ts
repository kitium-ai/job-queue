/**
 * Redis-based idempotency manager for exactly-once delivery
 */

import { getLogger } from '@kitiumai/logger';
import type ioredis from 'ioredis';

import type { IdempotencyRecord, IIdempotencyManager } from '../../core/interfaces/delivery-guarantee.interface';

const logger = getLogger();
const SOURCE = '@kitiumai/job-queue/idempotency-manager';

/**
 * Implementation of idempotency manager using Redis for exactly-once processing
 */
export class IdempotencyManager implements IIdempotencyManager {
  private readonly redis: InstanceType<typeof ioredis>;
  private readonly keyPrefix: string;

  constructor(redis: InstanceType<typeof ioredis>, keyPrefix = 'idempotency') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Record job execution result for idempotency
   */
  async recordExecution(
    idempotencyKey: string,
    jobId: string,
    jobName: string,
    result: unknown,
    ttlMs = 86400000 // 24 hours default
  ): Promise<void> {
    try {
      const key = this.buildKey(idempotencyKey);
      const expiresAt = Date.now() + ttlMs;

      const record: IdempotencyRecord = {
        idempotencyKey,
        jobId,
        jobName,
        result,
        createdAt: Date.now(),
        expiresAt,
      };

      // Store with TTL
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await this.redis.setex(key, ttlSeconds, JSON.stringify(record));

      logger.debug(`Recorded execution for idempotency key: ${idempotencyKey}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to record execution for idempotency key: ${idempotencyKey}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Get execution result for idempotency key
   */
  async getExecutionResult(idempotencyKey: string): Promise<IdempotencyRecord | null> {
    try {
      const key = this.buildKey(idempotencyKey);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as IdempotencyRecord;
    } catch (error) {
      logger.error(
        `Failed to get execution result for idempotency key: ${idempotencyKey}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }

  /**
   * Clean expired idempotency records
   */
  async cleanExpired(): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      let cleaned = 0;
      const now = Date.now();

      for (const key of keys) {
        if (await this.cleanKeyIfExpired(key, now)) {
          cleaned += 1;
        }
      }

      logger.debug(`Cleaned ${cleaned} expired idempotency records`, { source: SOURCE });
      return cleaned;
    } catch (error) {
      logger.error(
        'Failed to clean expired idempotency records',
        undefined,
        error instanceof Error ? error : undefined
      );
      return 0;
    }
  }

  private async cleanKeyIfExpired(key: string, now: number): Promise<boolean> {
    try {
      const data = await this.redis.get(key);
      if (!data) {
        return false;
      }

      const record = this.parseRecord(data);
      if (!record || record.expiresAt >= now) {
        return false;
      }

      await this.redis.del(key);
      return true;
    } catch (_error) {
      logger.debug(`Error checking expiration for key: ${key}`, { source: SOURCE });
      return false;
    }
  }

  private parseRecord(data: string): IdempotencyRecord | null {
    try {
      const parsed = JSON.parse(data) as Partial<IdempotencyRecord>;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      if (typeof parsed.expiresAt !== 'number') {
        return null;
      }
      return parsed as IdempotencyRecord;
    } catch {
      return null;
    }
  }

  /**
   * Clear specific idempotency record
   */
  async clear(idempotencyKey: string): Promise<void> {
    try {
      const key = this.buildKey(idempotencyKey);
      await this.redis.del(key);
      logger.debug(`Cleared idempotency record: ${idempotencyKey}`, { source: SOURCE });
    } catch (error) {
      logger.error(
        `Failed to clear idempotency record: ${idempotencyKey}`,
        undefined,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  private buildKey(idempotencyKey: string): string {
    return `${this.keyPrefix}:${idempotencyKey}`;
  }
}
