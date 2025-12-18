/**
 * BullMQ queue adapter implementation of IQueueAdapter interface
 * Provides unified interface for BullMQ queue backend
 */

import { getLogger } from '@kitiumai/logger';
import ioredis, { type RedisOptions } from 'ioredis';

import type { IQueueAdapter } from '../../../core/interfaces/queue-adapter.interface';
import type { IQueueClient } from '../../../core/interfaces/queue-client.interface';
import type { IQueueWorker } from '../../../core/interfaces/queue-worker.interface';
import type { QueueConfig } from '../../../shared/types/config.types';
import type { JobData, JobProcessor } from '../../../shared/types/job.types';
import { BullMQQueueClient } from './bullmq-queue-client';
import { BullMQWorker } from './bullmq-worker';

/**
 * BullMQ queue adapter
 * Implements the Adapter pattern for BullMQ queue backend
 */
export class BullMQAdapter implements IQueueAdapter {
  readonly name = 'bullmq';
  private redisConnection: InstanceType<typeof ioredis> | null = null;
  private readonly logger: ReturnType<typeof getLogger>;

  constructor() {
    this.logger = getLogger();
  }

  /**
   * Create a queue client instance
   * @param config Queue configuration
   * @returns Configured BullMQ queue client
   */
  createQueue(config: QueueConfig): IQueueClient {
    const redisConn = this.getOrCreateRedisConnection(config);
    this.logger.debug('Creating BullMQ queue client', { queue: config.name });
    return new BullMQQueueClient(config, redisConn);
  }

  /**
   * Create a worker instance
   * @param config Queue configuration
   * @param handler Job processor handler
   * @returns Configured BullMQ worker
   */
  createWorker<T extends JobData, R = unknown>(
    config: QueueConfig,
    _handler: JobProcessor<T, R>
  ): IQueueWorker {
    const redisConn = this.getOrCreateRedisConnection(config);
    this.logger.debug('Creating BullMQ worker', { queue: config.name });
    return new BullMQWorker(config, redisConn);
  }

  /**
   * Get or create Redis connection
   * Reuses connection across multiple queue/worker instances
   * @param config Queue configuration
   * @returns Redis connection instance
   */
  private getOrCreateRedisConnection(config: QueueConfig): InstanceType<typeof ioredis> {
    if (this.redisConnection) {
      return this.redisConnection;
    }

    const redisConfig = config.redis ?? {};
    this.redisConnection = new ioredis(this.buildRedisConnectionOptions(redisConfig));
    this.logger.info('Redis connection established', {
      host: redisConfig.host ?? 'localhost',
      port: redisConfig.port ?? 6379,
    });
    return this.redisConnection;
  }

  private buildRedisConnectionOptions(
    redisConfig: QueueConfig['redis'] | undefined
  ): RedisOptions {
    const cfg = redisConfig ?? {};
    return {
      host: cfg.host ?? 'localhost',
      port: cfg.port ?? 6379,
      password: cfg.password,
      username: cfg.username,
      db: cfg.db ?? 0,
      retryStrategy: cfg.retryStrategy,
      tls: cfg.tls,
      enableReadyCheck: cfg.enableReadyCheck ?? true,
      maxRetriesPerRequest: cfg.maxRetriesPerRequest,
      connectTimeout: cfg.connectTimeout ?? 10000,
    };
  }

  /**
   * Close Redis connection
   */
  async closeRedisConnection(): Promise<void> {
    if (!this.redisConnection) {
      return;
    }

    try {
      await this.redisConnection.quit();
      this.redisConnection = null;
      this.logger.info('Redis connection closed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to close Redis connection', { error: errorMessage });
    }
  }

  /**
   * Check if Redis connection is active
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.redisConnection !== null && this.redisConnection.status === 'ready';
  }
}
