/**
 * Redis connection manager service
 * Manages Redis connection lifecycle and provides connection instance
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';
import type Redis from 'ioredis';
import ioredis from 'ioredis';

import type { QueueConfig } from '../../../shared/types/config.types';

/**
 * Manager for Redis connection lifecycle
 */
export class RedisConnectionManager {
  private connection: Redis | null = null;
  private readonly logger: ReturnType<typeof getLogger>;
  private readonly maxRetries = 3;

  constructor() {
    const baseLogger = getLogger();
    this.logger =
      'child' in baseLogger && typeof baseLogger.child === 'function'
        ? (baseLogger as IAdvancedLogger).child({ component: 'redis-connection-manager' })
        : baseLogger;
  }

  /**
   * Create and establish Redis connection
   * @param config Queue configuration containing Redis settings
   * @returns Redis connection instance
   */
  async connect(config: QueueConfig): Promise<Redis> {
    if (this.connection?.status === 'ready') {
      this.logger.debug('Reusing existing Redis connection');
      return this.connection;
    }

    try {
      const redisConfig = config.redis ?? {};

      // @ts-ignore - ioredis type definitions have different optional handling
      this.connection = new ioredis({
        host: redisConfig.host ?? 'localhost',
        port: redisConfig.port ?? 6379,
        password: redisConfig.password,
        username: redisConfig.username,
        db: redisConfig.db ?? 0,
        retryStrategy: redisConfig.retryStrategy ?? this.defaultRetryStrategy.bind(this),
        tls: redisConfig.tls,
        enableReadyCheck: redisConfig.enableReadyCheck ?? true,
        maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
        connectTimeout: redisConfig.connectTimeout ?? 10000,
      });

      // Wait for connection to be ready
      await new Promise<void>((resolve, reject) => {
        if (this.connection!.status === 'ready') {
          resolve();
        } else {
          const readyHandler = () => {
            this.connection!.removeListener('error', errorHandler);
            resolve();
          };

          const errorHandler = (error: Error) => {
            this.connection!.removeListener('ready', readyHandler);
            reject(error);
          };

          this.connection!.once('ready', readyHandler);
          this.connection!.once('error', errorHandler);

          // Timeout after 10 seconds
          setTimeout(() => {
            if (this.connection?.status !== 'ready') {
              this.connection!.removeListener('ready', readyHandler);
              this.connection!.removeListener('error', errorHandler);
              reject(new Error('Redis connection timeout'));
            }
          }, 10000);
        }
      });

      this.logger.info('Redis connection established', {
        host: redisConfig.host ?? 'localhost',
        port: redisConfig.port ?? 6379,
      });

      return this.connection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to connect to Redis', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Get existing Redis connection
   * @returns Redis connection or null if not connected
   */
  getConnection(): Redis | null {
    return this.connection;
  }

  /**
   * Check if Redis connection is active
   * @returns True if connected and ready
   */
  isConnected(): boolean {
    return this.connection !== null && this.connection.status === 'ready';
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.connection) {
      return;
    }

    try {
      await this.connection.quit();
      this.connection = null;
      this.logger.info('Redis disconnected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error disconnecting from Redis', { error: errorMessage });
      this.connection = null;
    }
  }

  /**
   * Reset connection
   */
  reset(): void {
    this.connection = null;
  }

  /**
   * Ping Redis to verify connectivity
   * @returns True if Redis responds to ping
   */
  async ping(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }

    try {
      const result = await this.connection.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis ping failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Default retry strategy for Redis connection
   * @param times Number of reconnection attempts
   * @returns Delay in milliseconds or Error if max retries exceeded
   */
  private defaultRetryStrategy(times: number): number | Error {
    const delay = Math.min(times * 50, 2000);

    if (times > this.maxRetries) {
      this.logger.warn('Redis connection retry limit exceeded', { attempts: times });
      return new Error('Max retries exceeded');
    }

    this.logger.debug('Redis connection retry', { attempt: times, delay });

    return delay;
  }
}
