/**
 * Redis connection manager service
 * Manages Redis connection lifecycle and provides connection instance
 */

import { getLogger, type IAdvancedLogger } from '@kitiumai/logger';
import ioredis from 'ioredis';

import type { QueueConfig } from '../../../shared/types/config.types';

type RedisConnection = InstanceType<typeof ioredis>;

/**
 * Manager for Redis connection lifecycle
 */
export class RedisConnectionManager {
  private connection: RedisConnection | null = null;
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
  async connect(config: QueueConfig): Promise<RedisConnection> {
    if (this.connection?.status === 'ready') {
      this.logger.debug('Reusing existing Redis connection');
      return this.connection;
    }

    try {
      const redisConfig = config.redis ?? {};
      const connection = this.createConnection(redisConfig);
      this.connection = connection;
      await this.waitForReady(connection, 10000);

      this.logger.info('Redis connection established', {
        host: redisConfig.host ?? 'localhost',
        port: redisConfig.port ?? 6379,
      });

      return connection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to connect to Redis', { error: errorMessage });
      throw error;
    }
  }

  private createConnection(redisConfig: QueueConfig['redis'] | undefined): RedisConnection {
    const cfg = redisConfig ?? {};
    return new ioredis({
      host: cfg.host ?? 'localhost',
      port: cfg.port ?? 6379,
      password: cfg.password,
      username: cfg.username,
      db: cfg.db ?? 0,
      retryStrategy: cfg.retryStrategy ?? this.defaultRetryStrategy.bind(this),
      tls: cfg.tls,
      enableReadyCheck: cfg.enableReadyCheck ?? true,
      maxRetriesPerRequest: cfg.maxRetriesPerRequest,
      connectTimeout: cfg.connectTimeout ?? 10000,
    });
  }

  private async waitForReady(connection: RedisConnection, timeoutMs: number): Promise<void> {
    if (connection.status === 'ready') {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error('Redis connection timeout'));
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeoutHandle);
        connection.removeListener('ready', readyHandler);
        connection.removeListener('error', errorHandler);
      };

      const readyHandler = (): void => {
        cleanup();
        resolve();
      };

      const errorHandler = (error: Error): void => {
        cleanup();
        reject(error);
      };

      connection.once('ready', readyHandler);
      connection.once('error', errorHandler);
    });
  }

  /**
   * Get existing Redis connection
   * @returns Redis connection or null if not connected
   */
  getConnection(): RedisConnection | null {
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
  private defaultRetryStrategy(times: number): number | null {
    const delay = Math.min(times * 50, 2000);

    if (times > this.maxRetries) {
      this.logger.warn('Redis connection retry limit exceeded', { attempts: times });
      return null;
    }

    this.logger.debug('Redis connection retry', { attempt: times, delay });

    return delay;
  }
}
