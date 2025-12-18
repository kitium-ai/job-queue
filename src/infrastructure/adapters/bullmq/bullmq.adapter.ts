/**
 * BullMQ queue adapter implementation of IQueueAdapter interface
 * Provides unified interface for BullMQ queue backend
 */

import { getLogger } from '@kitiumai/logger';
import type Redis from 'ioredis';
import ioredis from 'ioredis';

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
  private redisConnection: Redis | null = null;
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
  private getOrCreateRedisConnection(config: QueueConfig): Redis {
    if (this.redisConnection) {
      return this.redisConnection;
    }

    try {
      const redisConfig = config.redis ?? {};
      const redisConnectionObj = {
        host: redisConfig.host ?? 'localhost',
        port: redisConfig.port ?? 6379,
        password: redisConfig.password,
        username: redisConfig.username,
        db: redisConfig.db ?? 0,
        retryStrategy: redisConfig.retryStrategy,
        tls: redisConfig.tls,
        enableReadyCheck: redisConfig.enableReadyCheck ?? true,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
        connectTimeout: redisConfig.connectTimeout ?? 10000,
      } as unknown as { host: string; port: number };
      this.redisConnection = new ioredis(redisConnectionObj);

      this.logger.info('Redis connection established', {
        host: redisConfig.host ?? 'localhost',
        port: redisConfig.port ?? 6379,
      });

      return this.redisConnection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create Redis connection', { error: errorMessage });
      throw error;
    }
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
